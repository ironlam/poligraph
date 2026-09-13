import pg from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { assertDisposableTestDb, describeIfDisposableDb } from "@/test/db-guard";

let db: typeof import("@/lib/db").db;
let getPublicMeasuresByElection: typeof import("../measures").getPublicMeasuresByElection;
let getPublicMeasureRollupsByElection: typeof import("../measures").getPublicMeasureRollupsByElection;
let getPublicMeasureThemeRollupsByElection: typeof import("../measures").getPublicMeasureThemeRollupsByElection;
let getPublicMeasureSubtopicRollupsByElection: typeof import("../measures").getPublicMeasureSubtopicRollupsByElection;
let loadPresidentialReaderGuideSummaries: typeof import("../presidential-reader-guides").loadPresidentialReaderGuideSummaries;

type DriverResult = { rows: unknown[]; rowCount: number | null };
type DriverQuery = { result: DriverResult };
type DriverMetrics = { queryCount: number; rowCount: number; resultBytes: number };

const originalClientQuery = pg.Client.prototype.query as unknown as (
  this: pg.Client,
  ...args: unknown[]
) => Promise<DriverResult>;
let driverQueries: DriverQuery[] = [];

function installDriverObserver() {
  pg.Client.prototype.query = function observedQuery(this: pg.Client, ...args: unknown[]) {
    const callback = args.at(-1);
    if (typeof callback === "function") {
      args[args.length - 1] = (error: unknown, result: DriverResult) => {
        if (!error) driverQueries.push({ result });
        callback(error, result);
      };
      return originalClientQuery.call(this, ...args);
    }

    return originalClientQuery.call(this, ...args).then((result) => {
      driverQueries.push({ result });
      return result;
    });
  } as unknown as typeof pg.Client.prototype.query;
}

function measureDriverMetrics(): DriverMetrics {
  const jsonBytes = (value: unknown) =>
    Buffer.byteLength(
      JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? item.toString() : item))
    );
  return {
    queryCount: driverQueries.length,
    rowCount: driverQueries.reduce((count, query) => count + query.result.rows.length, 0),
    resultBytes: driverQueries.reduce((bytes, query) => bytes + jsonBytes(query.result.rows), 0),
  };
}

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
    }
  }
  return election;
}

async function measureLegacyAndAggregate(electionId: string): Promise<{
  legacy: DriverMetrics;
  aggregate: DriverMetrics;
}> {
  driverQueries = [];
  await getPublicMeasuresByElection(electionId, { includeWithdrawn: true });
  const legacy = measureDriverMetrics();

  driverQueries = [];
  await Promise.all([
    getPublicMeasureRollupsByElection(electionId),
    getPublicMeasureThemeRollupsByElection(electionId),
    getPublicMeasureSubtopicRollupsByElection(electionId),
    loadPresidentialReaderGuideSummaries(electionId),
  ]);
  const aggregate = measureDriverMetrics();
  return { legacy, aggregate };
}

describeIfDisposableDb("volumes des lectures présidentielles au niveau du driver", () => {
  const elections: string[] = [];

  beforeAll(async () => {
    assertDisposableTestDb();
    installDriverObserver();
    ({ db } = await import("@/lib/db"));
    ({
      getPublicMeasuresByElection,
      getPublicMeasureRollupsByElection,
      getPublicMeasureThemeRollupsByElection,
      getPublicMeasureSubtopicRollupsByElection,
    } = await import("../measures"));
    ({ loadPresidentialReaderGuideSummaries } = await import("../presidential-reader-guides"));
  });

  afterAll(async () => {
    for (const electionId of elections) {
      await db.measure.deleteMany({ where: { electionId } });
      await db.candidacy.deleteMany({ where: { electionId } });
      await db.election.delete({ where: { id: electionId } });
    }
    await db.politician.deleteMany({ where: { slug: { startsWith: "measure-loads-" } } });
    pg.Client.prototype.query = originalClientQuery as unknown as typeof pg.Client.prototype.query;
    await db.$disconnect();
  });

  it("réduit les lignes et le volume du résultat sur deux volumes synthétiques", async () => {
    const volumes = [
      { slug: "measure-loads-small", candidacies: 4, measuresPerCandidacy: 5 },
      { slug: "measure-loads-large", candidacies: 20, measuresPerCandidacy: 10 },
    ];
    const reports: Array<{
      volume: string;
      measures: number;
      legacy: DriverMetrics;
      aggregate: DriverMetrics;
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
      expect(result.aggregate.rowCount).toBeLessThan(result.legacy.rowCount);
      expect(result.aggregate.resultBytes).toBeLessThan(result.legacy.resultBytes);
      expect(result.aggregate.queryCount).toBeLessThanOrEqual(result.legacy.queryCount);
    }

    console.log(JSON.stringify({ type: "presidential-measure-loads", reports }));
    expect(reports).toHaveLength(2);
    const small = reports[0]!;
    const large = reports[1]!;
    expect(large.legacy.rowCount).toBeGreaterThan(small.legacy.rowCount);
    expect(large.aggregate.rowCount).toBeGreaterThan(small.aggregate.rowCount);
  }, 120_000);
});
