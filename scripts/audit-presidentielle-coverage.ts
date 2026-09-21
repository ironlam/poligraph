#!/usr/bin/env tsx
/**
 * npm run audit:presidentielle-coverage [-- --json]
 *
 * Read-only editorial coverage of the declared candidacies of the 2027 presidential election.
 * It states, it never repairs: the findings feed /hub-mesure, /hub-candidature and the theme
 * synthesis review, which are the only paths allowed to write.
 *
 * The reads live here rather than beside the classifier because `@/lib/db` builds its client at
 * import time, which would make the classifier unreachable from a plain unit test.
 */
import { db } from "@/lib/db";
import {
  classifyCandidacyCoverage,
  coverageAxis,
  needsWebResearch,
  type CandidacyCoverage,
} from "@/lib/presidentielle/coverage-audit";
import {
  computeThemeCorpusFingerprint,
  getThemeSynthesisState,
} from "@/lib/presidentielle/candidacy-theme-synthesis";
import type { ThemeCategory } from "@/generated/prisma";

const ELECTION_SLUG = "presidentielle-2027";

async function collect(): Promise<CandidacyCoverage[]> {
  // Unbounded by design: this is the whole declared field of one presidential election, and a take
  // would silently drop the candidacy a reviewer is looking for.
  const candidacies = await db.candidacy.findMany({
    where: { election: { slug: ELECTION_SLUG }, status: "DECLARE" },
    select: {
      id: true,
      candidateName: true,
      politician: { select: { slug: true } },
      programEditions: { select: { publicationStatus: true } },
      presidentialData: {
        select: {
          synthesis: true,
          synthesisGeneratedAt: true,
          themeSyntheses: {
            select: { theme: true, status: true, corpusFingerprint: true, promptVersion: true },
          },
        },
      },
    },
  });

  const rows: CandidacyCoverage[] = [];
  for (const candidacy of candidacies) {
    // The same population the public fiche shows, so a finding always describes what a reader sees.
    const measures = await db.measure.findMany({
      where: {
        candidacyId: candidacy.id,
        publicationStatus: "PUBLISHED",
        withdrawnAt: null,
        publishedRevision: { reviewedAt: { not: null } },
      },
      select: {
        id: true,
        theme: true,
        publishedRevisionId: true,
        publishedRevision: { select: { text: true, details: true, publishedAt: true } },
      },
    });

    let firstMeasurePublishedAt: Date | null = null;
    const byTheme = new Map<ThemeCategory, typeof measures>();
    for (const measure of measures) {
      const revision = measure.publishedRevision;
      if (!revision) continue;
      if (
        revision.publishedAt &&
        (!firstMeasurePublishedAt || revision.publishedAt < firstMeasurePublishedAt)
      ) {
        firstMeasurePublishedAt = revision.publishedAt;
      }
      byTheme.set(measure.theme, [...(byTheme.get(measure.theme) ?? []), measure]);
    }

    const stored = new Map(
      (candidacy.presidentialData?.themeSyntheses ?? []).map((synthesis) => [
        synthesis.theme,
        synthesis,
      ])
    );
    const themes = [...byTheme].map(([theme, themeMeasures]) => ({
      theme,
      state: getThemeSynthesisState(
        stored.get(theme) ?? null,
        computeThemeCorpusFingerprint({
          theme,
          measures: themeMeasures.map((measure) => ({
            id: measure.id,
            revisionId: measure.publishedRevisionId!,
            text: measure.publishedRevision!.text,
            details: measure.publishedRevision!.details,
          })),
        })
      ),
    }));

    rows.push(
      classifyCandidacyCoverage({
        candidateName: candidacy.candidateName,
        politicianSlug: candidacy.politician?.slug ?? null,
        measureCount: measures.length,
        programEditionCount: candidacy.programEditions.length,
        publishedProgramEditionCount: candidacy.programEditions.filter(
          (edition) => edition.publicationStatus === "PUBLISHED"
        ).length,
        synthesis: candidacy.presidentialData?.synthesis ?? null,
        synthesisGeneratedAt: candidacy.presidentialData?.synthesisGeneratedAt ?? null,
        firstMeasurePublishedAt,
        themes,
        storedThemeSyntheses: [...stored.values()].map((synthesis) => ({
          theme: synthesis.theme,
          promptVersion: synthesis.promptVersion,
        })),
      })
    );
  }
  return rows;
}

function print(rows: CandidacyCoverage[]): void {
  const withFindings = rows.filter((row) => row.findings.length > 0);
  const targets = rows.filter((row) => row.webResearchWorthwhile);

  console.log(
    `[presidentielle:coverage] ${rows.length} candidatures déclarées, ` +
      `${withFindings.length} avec au moins un constat\n`
  );

  for (const row of withFindings.sort((a, b) => b.findings.length - a.findings.length)) {
    console.log(`${row.candidateName} (${row.politicianSlug ?? "sans fiche"})`);
    for (const finding of row.findings) {
      const flag = needsWebResearch(finding.kind) ? "web" : "base";
      console.log(
        `  [${flag}] ${coverageAxis(finding.kind)} · ${finding.kind} : ${finding.detail}`
      );
    }
  }

  const lineage: Record<string, number> = {};
  for (const row of rows) {
    for (const [version, count] of Object.entries(row.promptLineage)) {
      lineage[version] = (lineage[version] ?? 0) + count;
    }
  }
  console.log("\nLignées de prompt des synthèses thématiques (décompte, pas une péremption) :");
  for (const [version, count] of Object.entries(lineage).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(count).padStart(4)}  ${version}`);
  }

  console.log(
    `\nCandidatures où une recherche web peut apporter quelque chose : ${targets.length}` +
      (targets.length > 0
        ? `\n  ${targets.map((row) => row.politicianSlug ?? row.candidateName).join(", ")}`
        : "")
  );
}

async function main(): Promise<void> {
  const rows = await collect();
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }
  print(rows);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
