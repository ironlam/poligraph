import { writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { assertDisposableTestDb, describeIfDisposableDb } from "@/test/db-guard";
import { measurePostgresDriverOperation } from "@/test/postgres-driver-observer";
import { pickMeasureSourceUrl } from "@/lib/presidentielle/measure-source";
import { seedSubjectReads } from "./subject-read-fixture";

vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn(), revalidateTag: vi.fn() }));

let db: typeof import("@/lib/db").db;

describeIfDisposableDb("subject and comparison driver volume budgets", () => {
  beforeAll(async () => {
    assertDisposableTestDb();
    ({ db } = await import("@/lib/db"));
  });
  afterAll(async () => {
    await db.election.deleteMany({ where: { slug: { startsWith: "subject-budget-" } } });
    await db.politician.deleteMany({ where: { slug: { startsWith: "subject-budget-" } } });
    await db.measureSubtopic.deleteMany({ where: { slug: { startsWith: "subject-budget-" } } });
    await db.measureReaderGuide.deleteMany({ where: { slug: { startsWith: "subject-budget-" } } });
    await db.$disconnect();
  });

  it("measures both paths and decomposes the subject reads on growing fixtures", async () => {
    const { loadSubjectPageData } = await import("../subject-page");
    const { getPresidentialComparison } = await import("../presidential-comparison");
    const { getPublicPresidentialCandidates } = await import("../presidential-candidates-public");
    const {
      getPublicMeasuresByTheme,
      getLatestPresidentialReviewDate,
      getPublicMeasuresByElection,
      getPublicComparisonMeasurePage,
    } = await import("../measures");
    const { loadThemesIndex } = await import("../themes-index");
    const { getPublicMeasureVoteRelations } = await import("@/lib/measures/vote-links");
    async function capture<T>(operation: () => Promise<T>) {
      const start = performance.now();
      const observed = await measurePostgresDriverOperation(operation);
      return { ...observed, durationMs: performance.now() - start };
    }
    const reports = [];
    for (const [candidacies, measuresPerCandidate] of [
      [4, 12],
      [4, 60],
      [8, 12],
    ]) {
      const slug = `subject-budget-${candidacies}-${measuresPerCandidate}`;
      const fixture = await seedSubjectReads(db, slug, candidacies!, measuresPerCandidate!);
      const { id } = fixture.election;
      const subject = await capture(() => loadSubjectPageData(id, slug, "SANTE"));
      const selected = fixture.candidates.slice(0, 2).map((c) => c.slug);
      const comparison = await capture(() =>
        getPresidentialComparison({
          electionSlug: slug,
          themeSlug: "sante",
          candidateSlugs: selected,
          candidatePages: { [selected[0]!]: 2 },
        })
      );
      const expected = subject.result.candidates
        .filter(({ candidate }) => selected.includes(candidate.politicianSlug!))
        .map(({ candidate, measures }) => {
          const page = candidate.politicianSlug === selected[0] ? 2 : 1;
          return {
            candidacyId: candidate.id,
            name: candidate.candidateName,
            slug: candidate.politicianSlug,
            partyLabel: candidate.partyLabel,
            accentColor: candidate.accentColor,
            totalMeasures: measures.length,
            page,
            totalPages: Math.max(1, Math.ceil(measures.length / 6)),
            measures: measures.slice((page - 1) * 6, page * 6).map(({ measure }) => ({
              id: measure.id,
              slug: measure.slug,
              text: measure.text,
              sourceUrl: pickMeasureSourceUrl(measure.sources),
              subtopics: measure.subtopics,
              precision: measure.precision,
              qualifications: measure.qualifications,
              withdrawal: measure.withdrawal,
            })),
          };
        });
      expect(comparison.result?.selectedCandidates).toEqual(expected);
      expect(comparison.result?.lastReviewedAt).toEqual(subject.result.lastReviewedAt);
      expect(comparison.result?.themes).toEqual(
        subject.result.siblingThemes
          .filter((t) => t.publishable)
          .map((t) => ({ code: t.theme, slug: t.slug, label: t.label }))
      );
      expect(comparison.result?.candidateOptions).toHaveLength(candidacies!);
      expect(subject.result.candidates.flatMap((c) => c.measures)).toHaveLength(
        candidacies! * measuresPerCandidate!
      );
      if (candidacies === 4 && measuresPerCandidate === 12) {
        const events: Array<{
          operation: string;
          driverCalls: number;
          driverRows: number;
          pendingDriverCalls: number;
          unsupportedCalls: number;
        }> = [];
        vi.stubEnv("DB_READ_TELEMETRY", "true");
        vi.stubEnv("DB_READ_SAMPLE_RATE", "1");
        vi.stubEnv("DB_READ_MAX_EVENTS", "10000");
        const log = vi
          .spyOn(console, "info")
          .mockImplementation((line: string) => events.push(JSON.parse(line)));
        try {
          const traced = await capture(() =>
            getPresidentialComparison({
              electionSlug: slug,
              themeSlug: "sante",
              candidateSlugs: selected,
            })
          );
          // Election resolution precedes every cache boundary and is deliberately not attributed.
          expect(events.reduce((sum, e) => sum + e.driverCalls, 0) + 1).toBe(
            traced.metrics.queryCount
          );
          expect(events.reduce((sum, e) => sum + e.driverRows, 0) + 1).toBe(
            traced.metrics.returnedRowCount
          );
          expect(
            events.filter((e) => e.operation === "presidential.comparison.page.load")
          ).toHaveLength(2);
          expect(events.some((e) => e.operation === "presidential.subject.load")).toBe(false);
          expect(events.every((e) => e.pendingDriverCalls === 0 && e.unsupportedCalls === 0)).toBe(
            true
          );
          expect(JSON.stringify(events)).not.toContain(slug);
        } finally {
          log.mockRestore();
          vi.unstubAllEnvs();
        }
      }

      const candidates = await capture(() => getPublicPresidentialCandidates(slug));
      const measures = await capture(() =>
        getPublicMeasuresByTheme(id, "SANTE", { includeWithdrawn: true })
      );
      // The older full projection is an independent DTO oracle for the theme's reduced projection.
      const fullProjection = await capture(() =>
        getPublicMeasuresByElection(id, { includeWithdrawn: true })
      );
      expect([...measures.result].sort((a, b) => a.id.localeCompare(b.id))).toEqual(
        [...fullProjection.result].sort((a, b) => a.id.localeCompare(b.id))
      );
      expect(measures.metrics.serializedDriverResultBytes).toBeLessThan(
        fullProjection.metrics.serializedDriverResultBytes * 0.5
      );
      const selectedPage = await capture(() =>
        getPublicComparisonMeasurePage({
          electionId: id,
          candidacyId: fixture.candidates[0]!.id,
          theme: "SANTE",
          skip: 6,
          take: 6,
        })
      );
      expect(selectedPage.result).toHaveLength(6);
      expect(selectedPage.metrics.queryCount).toBeLessThanOrEqual(6);
      expect(selectedPage.metrics.returnedRowCount).toBeLessThanOrEqual(40);
      expect(selectedPage.metrics.serializedDriverResultBytes).toBeLessThan(5_000);
      expect(comparison.metrics.queryCount).toBeLessThanOrEqual(21);
      expect(comparison.metrics.serializedDriverResultBytes).toBeLessThan(15_000);
      const counts = await capture(() =>
        Promise.all([
          db.candidacy.count({
            where: {
              electionId: id,
              status: { not: null },
              sourceUrl: { not: null },
              sourceLabel: { not: null },
            },
          }),
          db.measure.count({
            where: {
              electionId: id,
              theme: "SANTE",
              depublishedAt: null,
              latestRevision: { is: { reviewedAt: null, discardedAt: null, supersededAt: null } },
            },
          }),
        ])
      );
      const reviewDate = await capture(() => getLatestPresidentialReviewDate(id, "SANTE"));
      const themes = await capture(() => loadThemesIndex(id, slug));
      const votes = await capture(() =>
        getPublicMeasureVoteRelations(
          measures.result.map((m) => ({
            measureId: m.id,
            publishedRevisionId: m.publishedRevisionId,
          }))
        )
      );
      const breakdown = Object.fromEntries(
        Object.entries({ candidates, measures, counts, reviewDate, themes, votes }).map(
          ([name, value]) => [name, value.metrics]
        )
      );
      expect(Object.values(breakdown).reduce((sum, value) => sum + value.returnedRowCount, 0)).toBe(
        subject.metrics.returnedRowCount
      );
      reports.push({
        candidacies,
        measuresPerCandidate,
        subject: { ...subject.metrics, durationMs: subject.durationMs },
        comparison: { ...comparison.metrics, durationMs: comparison.durationMs },
        breakdown,
        selectedPage: selectedPage.metrics,
      });
    }
    const [small, moreMeasures, moreCandidates] = reports;
    expect(moreMeasures!.comparison.returnedRowCount).toBe(small!.comparison.returnedRowCount);
    expect(moreMeasures!.comparison.serializedDriverResultBytes).toBeLessThanOrEqual(
      small!.comparison.serializedDriverResultBytes + 256
    );
    // Complete dropdown and grouped counts cost four metadata rows per additional candidacy.
    expect(
      moreCandidates!.comparison.returnedRowCount - small!.comparison.returnedRowCount
    ).toBeLessThanOrEqual(4 * 4);
    for (const report of reports.slice(1)) {
      expect(report.selectedPage.returnedRowCount).toBe(small!.selectedPage.returnedRowCount);
      expect(report.selectedPage.queryCount).toBe(small!.selectedPage.queryCount);
      expect(report.selectedPage.serializedDriverResultBytes).toBeLessThanOrEqual(
        small!.selectedPage.serializedDriverResultBytes + 128
      );
    }
    const report = {
      definition:
        "Driver rows and serialized JSON result bytes on synthetic fixtures, not protocol bytes or billed egress. Cache hooks stubbed: all loaders execute.",
      reports,
    };
    await writeFile(
      process.env.SUBJECT_METRICS_OUTPUT ?? "/tmp/subject-read-metrics.json",
      JSON.stringify(report, null, 2)
    );
    console.log(JSON.stringify(report));
  }, 120_000);
});
