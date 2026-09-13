import { writeFile } from "node:fs/promises";
import pg from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { assertDisposableTestDb, describeIfDisposableDb } from "@/test/db-guard";
import {
  measurePostgresDriverOperation,
  type PostgresDriverMetrics,
} from "@/test/postgres-driver-observer";

let db: typeof import("@/lib/db").db;
let getPublicMeasuresByElection: typeof import("../measures").getPublicMeasuresByElection;
let getPublicMeasureRollupsByElection: typeof import("../measures").getPublicMeasureRollupsByElection;
let getPublicMeasureThemeRollupsByElection: typeof import("../measures").getPublicMeasureThemeRollupsByElection;
let getPublicMeasureSubtopicRollupsByElection: typeof import("../measures").getPublicMeasureSubtopicRollupsByElection;
let loadPresidentialReaderGuideSummaries: typeof import("../presidential-reader-guides").loadPresidentialReaderGuideSummaries;
let loadHubMeasureContext: typeof import("../hub").loadHubMeasureContext;
let loadThemesIndex: typeof import("../themes-index").loadThemesIndex;
let loadPrioritesData: typeof import("../priorites").loadPrioritesData;

async function seedVolume(slug: string, candidacyCount: number, measuresPerCandidacy: number) {
  const { createMeasure, reviewMeasureRevision, publishMeasureRevision } =
    await import("@/lib/measures/transitions");
  const election = await db.election.create({
    data: {
      slug,
      type: "PRESIDENTIELLE",
      scope: "NATIONAL",
      title: `Élection de benchmark ${slug}`,
    },
  });

  const subtopics = await Promise.all([
    db.measureSubtopic.create({
      data: {
        slug: `${slug}-transports`,
        label: "Transports du quotidien",
        description: "Sous-thème de fixture",
        theme: "TRANSPORTS",
        active: true,
        sortOrder: 1,
      },
    }),
    db.measureSubtopic.create({
      data: {
        slug: `${slug}-sante`,
        label: "Accès aux soins",
        description: "Sous-thème de fixture",
        theme: "SANTE",
        active: true,
        sortOrder: 2,
      },
    }),
  ]);
  const guides = await Promise.all(
    ["climat", "justice"].map((name, index) =>
      db.measureReaderGuide.create({
        data: {
          slug: `${slug}-${name}`,
          label: `Guide ${name}`,
          definition: `Définition publique du guide ${name}, suffisamment longue pour la fixture et
            représentative d'une explication éditoriale relue et sourcée.`,
          aliases: [],
          sourceKind: "OFFICIAL_INSTITUTION",
          sourceUrl: `https://example.org/${slug}/${name}`,
          sourceLabel: "Source du guide",
          sourcePublisher: "Institution fixture",
          publicationStatus: "PUBLISHED",
          reviewedAt: new Date(`2027-01-0${index + 2}T00:00:00Z`),
          reviewedBy: "fixture",
        },
      })
    )
  );

  for (let candidateIndex = 0; candidateIndex < candidacyCount; candidateIndex += 1) {
    const politician = await db.politician.create({
      data: {
        slug: `${slug}-politician-${candidateIndex}`,
        firstName: `Candidat${candidateIndex}`,
        lastName: "Benchmark",
        fullName: `Candidat${candidateIndex} Benchmark`,
        publicationStatus: "PUBLISHED",
      },
    });
    const candidacy = await db.candidacy.create({
      data: {
        electionId: election.id,
        politicianId: politician.id,
        candidateName: `Candidat${candidateIndex} Benchmark`,
        status: "DECLARE",
        sourceUrl: "https://example.org/candidate",
        sourceLabel: "Source de benchmark",
      },
    });
    await db.candidacyPresidential.create({
      data: { candidacyId: candidacy.id, publicationStatus: "PUBLISHED" },
    });

    for (let measureIndex = 0; measureIndex < measuresPerCandidacy; measureIndex += 1) {
      const seeded = await createMeasure({
        politicianId: politician.id,
        electionId: election.id,
        candidacyId: candidacy.id,
        programEditionId: null,
        attribution: "PERSONAL",
        theme: measureIndex % 2 === 0 ? "TRANSPORTS" : "SANTE",
        precedingMeasureId: null,
        revision: {
          text: `Mesure de benchmark ${candidateIndex}-${measureIndex} `.repeat(8),
          details: `Contexte lourd de benchmark ${candidateIndex}-${measureIndex} `.repeat(8),
          precision: "OBJECTIF_SANS_CHIFFRE",
          validFrom: new Date("2027-01-01T00:00:00Z"),
          extractionMethod: "MANUAL",
          extractionConfidence: null,
          extractorVersion: null,
        },
        sources: [
          {
            sourceKind: "DISCOURS_CAMPAGNE",
            tier: "PRIMARY",
            url: `https://example.org/source-${candidateIndex}-${measureIndex}`,
            page: null,
            publishedAt: new Date("2027-01-01T00:00:00Z"),
          },
        ],
      });
      await reviewMeasureRevision({ ...seeded, reviewedBy: "benchmark" });
      await publishMeasureRevision(seeded);
      await db.measureRevision.update({
        where: { id: seeded.revisionId },
        data: { evidenceSnapshot: { heavyFixtureText: "x".repeat(4096), sourceCount: 2 } },
      });
      await db.measureSource.create({
        data: {
          measureRevisionId: seeded.revisionId,
          sourceKind: "PROGRAMME_CANDIDAT",
          tier: "SECONDARY",
          url: `https://example.org/secondary-${candidateIndex}-${measureIndex}`,
          page: "2",
          publishedAt: new Date("2027-01-02T00:00:00Z"),
        },
      });
      await db.measureRevisionSubtopic.create({
        data: {
          revisionId: seeded.revisionId,
          subtopicId: subtopics[measureIndex % 2]!.id,
          status: "APPROVED",
          method: "MANUAL",
          classifierVersion: "fixture",
          taxonomyVersion: "fixture",
          reviewedAt: new Date("2027-01-03T00:00:00Z"),
          reviewedBy: "fixture",
        },
      });
      await db.measureRevisionReaderGuide.createMany({
        data: guides.map((guide, guideIndex) => ({
          revisionId: seeded.revisionId,
          guideId: guide.id,
          term: `guide ${guideIndex}`,
          normalizedTerm: `${slug}-${candidateIndex}-${measureIndex}-${guideIndex}`,
          evidenceSpan: `Mention guide ${guideIndex}`,
          reason: "Mention explicitement rattachée par la fixture.",
          confidence: 1,
          status: "APPROVED" as const,
          method: "MANUAL" as const,
          detectorVersion: "fixture",
          reviewedAt: new Date("2027-01-03T00:00:00Z"),
          reviewedBy: "fixture",
        })),
      });
    }
  }
  return election;
}

async function measureLegacyAndAggregate(electionId: string): Promise<{
  legacy: PostgresDriverMetrics;
  aggregate: PostgresDriverMetrics;
}> {
  const legacy = await measurePostgresDriverOperation(() =>
    getPublicMeasuresByElection(electionId, { includeWithdrawn: true })
  );
  const aggregate = await measurePostgresDriverOperation(() =>
    Promise.all([
      getPublicMeasureRollupsByElection(electionId),
      getPublicMeasureThemeRollupsByElection(electionId),
      getPublicMeasureSubtopicRollupsByElection(electionId),
      loadPresidentialReaderGuideSummaries(electionId),
    ])
  );
  return { legacy: legacy.metrics, aggregate: aggregate.metrics };
}

describeIfDisposableDb("volumes des lectures présidentielles au niveau du driver", () => {
  const elections: string[] = [];

  beforeAll(async () => {
    assertDisposableTestDb();
    ({ db } = await import("@/lib/db"));
    ({
      getPublicMeasuresByElection,
      getPublicMeasureRollupsByElection,
      getPublicMeasureThemeRollupsByElection,
      getPublicMeasureSubtopicRollupsByElection,
    } = await import("../measures"));
    ({ loadPresidentialReaderGuideSummaries } = await import("../presidential-reader-guides"));
    ({ loadHubMeasureContext } = await import("../hub"));
    ({ loadThemesIndex } = await import("../themes-index"));
    ({ loadPrioritesData } = await import("../priorites"));
  });

  afterAll(async () => {
    for (const electionId of elections) {
      await db.measure.deleteMany({ where: { electionId } });
      await db.candidacy.deleteMany({ where: { electionId } });
      await db.election.delete({ where: { id: electionId } });
    }
    await db.measureReaderGuide.deleteMany({ where: { slug: { startsWith: "measure-loads-" } } });
    await db.measureSubtopic.deleteMany({ where: { slug: { startsWith: "measure-loads-" } } });
    await db.politician.deleteMany({ where: { slug: { startsWith: "measure-loads-" } } });
    await db.$disconnect();
  });

  it("réduit les lignes et le volume du résultat sur deux volumes synthétiques", async () => {
    const driverPool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: false });
    const borrowedClientCapture = await measurePostgresDriverOperation(async () => {
      const client = await driverPool.connect();
      try {
        await client.query("SELECT 1 AS borrowed_client_fixture");
      } finally {
        client.release();
      }
    });
    await driverPool.end();
    expect(borrowedClientCapture.metrics.queryCount).toBe(1);
    expect(borrowedClientCapture.metrics.returnedRowCount).toBe(1);

    const volumes = [
      { slug: "measure-loads-small", candidacies: 4, measuresPerCandidacy: 5 },
      { slug: "measure-loads-large", candidacies: 4, measuresPerCandidacy: 50 },
    ];
    const candidateGrowthVolume = {
      slug: "measure-loads-candidate-growth",
      candidacies: 8,
      measuresPerCandidacy: 5,
    };
    const reports: Array<{
      volume: string;
      measures: number;
      legacy: PostgresDriverMetrics;
      aggregate: PostgresDriverMetrics;
    }> = [];

    for (const volume of volumes) {
      const election = await seedVolume(
        volume.slug,
        volume.candidacies,
        volume.measuresPerCandidacy
      );
      elections.push(election.id);
      const result = await measureLegacyAndAggregate(election.id);
      reports.push({
        volume: volume.slug,
        measures: volume.candidacies * volume.measuresPerCandidacy,
        ...result,
      });
      expect(result.aggregate.returnedRowCount).toBeLessThan(result.legacy.returnedRowCount);
      expect(result.aggregate.serializedDriverResultBytes).toBeLessThan(
        result.legacy.serializedDriverResultBytes
      );
      expect(result.aggregate.serializedDriverResultBytes).toBeLessThan(10_000);
      expect(result.legacy.serializedDriverResultBytes).toBeGreaterThan(
        volume.candidacies * volume.measuresPerCandidacy * 4096
      );
      expect(result.aggregate.queryCount).toBeLessThanOrEqual(result.legacy.queryCount);
    }

    const candidateGrowthElection = await seedVolume(
      candidateGrowthVolume.slug,
      candidateGrowthVolume.candidacies,
      candidateGrowthVolume.measuresPerCandidacy
    );
    elections.push(candidateGrowthElection.id);

    const pathReports = [];
    for (const volume of [...volumes, candidateGrowthVolume]) {
      const election = await db.election.findUniqueOrThrow({ where: { slug: volume.slug } });
      const captures = await Promise.all([
        measurePostgresDriverOperation(() => loadHubMeasureContext(election.id, volume.slug)),
        measurePostgresDriverOperation(() => loadThemesIndex(election.id, volume.slug)),
        measurePostgresDriverOperation(() => loadPrioritesData(election.id, volume.slug)),
      ]);
      const [hub, themes, priorites] = captures;
      expect(hub.result.featuredReaderGuides).toHaveLength(2);
      expect(themes.result.featuredSubtopics.length).toBeGreaterThan(0);
      expect(priorites.result.documentedRows).toHaveLength(volume.candidacies);
      pathReports.push({
        volume: volume.slug,
        hub: hub.metrics,
        themes: themes.metrics,
        priorites: priorites.metrics,
      });
    }

    for (const path of ["hub", "themes", "priorites"] as const) {
      const small = pathReports[0]![path];
      const large = pathReports[1]![path];
      const candidateGrowth = pathReports[2]![path];
      const absoluteQueryBudgets = { hub: 5, themes: 2, priorites: 17 };
      expect(large.queryCount).toBe(small.queryCount);
      expect(small.queryCount).toBeLessThanOrEqual(absoluteQueryBudgets[path]);
      expect(candidateGrowth.queryCount).toBeLessThanOrEqual(absoluteQueryBudgets[path]);
      expect(candidateGrowth.queryCount).toBe(small.queryCount);
      expect(large.returnedRowCount).toBeLessThanOrEqual(small.returnedRowCount + 20);
      expect(large.serializedDriverResultBytes).toBeLessThanOrEqual(
        small.serializedDriverResultBytes * 2 + 10_000
      );
    }

    const report = {
      type: "presidential-load-volume-guards",
      metricDefinition:
        "returnedRowCount and serializedDriverResultBytes are measured at node-postgres receipt; they are not protocol bytes or billed egress.",
      fixtures: volumes.map((volume) => ({
        ...volume,
        totalMeasures: volume.candidacies * volume.measuresPerCandidacy,
        heavyEvidenceSnapshotBytes: 4096,
        guides: 2,
        activeSubtopics: 2,
      })),
      budgets: {
        absoluteQueryBudgets: { hub: 5, themes: 2, priorites: 17 },
        queryGrowth: "0 for fixed and increased candidacy populations",
        rowGrowth: "at most 20 rows when measures increase from 20 to 200",
        serializedResultGrowth: "at most 2x plus 10000 bytes",
      },
      aggregateComparison: reports,
      applicationPaths: pathReports,
    };
    const output = process.env.PERFORMANCE_METRICS_OUTPUT;
    if (output) await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(JSON.stringify(report));
    expect(reports).toHaveLength(2);
    const small = reports[0]!;
    const large = reports[1]!;
    expect(large.legacy.returnedRowCount).toBeGreaterThan(small.legacy.returnedRowCount);
    expect(large.aggregate.returnedRowCount).toBeLessThanOrEqual(
      small.aggregate.returnedRowCount + 20
    );
  }, 120_000);
});
