#!/usr/bin/env tsx
/**
 * npm run measures:audit-clarity [-- --election <slug>] [--drafts] [--indicatifs] [--json] [--limit N] [--strict]
 *
 * Read only. Lists the measures whose text trips a clarity rule (src/lib/measures/clarity.ts) so
 * a human reads them. A finding is a question to ask, not a verdict. Writes nothing, calls no
 * model, never touches the web.
 *
 * Exits 0 by default. With --strict it exits 1 when a finding needs a read (A_RELIRE), so it can
 * gate a routine without being interpreted by hand.
 */
import { db } from "@/lib/db";
import { parseCLIOptions } from "@/lib/cli/parse-options";
import { analyzeMeasureClarity, type ClarityFinding } from "@/lib/measures/clarity";

const OPTIONS = [
  { name: "--election", type: "string" },
  { name: "--drafts", type: "boolean" },
  { name: "--indicatifs", type: "boolean" },
  { name: "--json", type: "boolean" },
  { name: "--limit", type: "number" },
  { name: "--strict", type: "boolean" },
] as const;

type Row = {
  measureId: string;
  candidate: string | null;
  state: "PUBLISHED" | "DRAFT";
  text: string;
  findings: ClarityFinding[];
};

/** Acronyms a published reader guide already explains, read from its label and aliases. */
async function knownAcronyms(): Promise<Set<string>> {
  const guides = await db.measureReaderGuide.findMany({
    where: { publicationStatus: "PUBLISHED", active: true },
    select: { label: true, aliases: true },
  });
  const acronyms = new Set<string>();
  for (const value of guides.flatMap((guide) => [guide.label, ...guide.aliases])) {
    for (const token of value.match(/[A-ZÉ]{2,6}/gu) ?? []) acronyms.add(token);
  }
  return acronyms;
}

async function main(): Promise<void> {
  const parsed = parseCLIOptions(process.argv.slice(2), OPTIONS);
  const electionSlug =
    typeof parsed.election === "string" ? parsed.election : "presidentielle-2027";
  const includeDrafts = parsed.drafts === true;
  const limit = typeof parsed.limit === "number" ? Math.max(1, Math.trunc(parsed.limit)) : 60;
  const acronyms = await knownAcronyms();

  const measures = await db.measure.findMany({
    where: {
      election: { slug: electionSlug },
      ...(includeDrafts
        ? { OR: [{ publicationStatus: "PUBLISHED" }, { latestRevisionId: { not: null } }] }
        : { publicationStatus: "PUBLISHED", publishedRevisionId: { not: null } }),
    },
    select: {
      id: true,
      publicationStatus: true,
      publishedRevision: { select: { text: true, details: true } },
      latestRevision: { select: { text: true, details: true, discardedAt: true } },
      candidacy: { select: { politician: { select: { lastName: true } } } },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  const rows: Row[] = [];
  for (const measure of measures) {
    const published = measure.publishedRevision;
    const draft =
      measure.latestRevision && !measure.latestRevision.discardedAt ? measure.latestRevision : null;
    const revision = published ?? (includeDrafts ? draft : null);
    if (!revision) continue;
    const findings = analyzeMeasureClarity(revision, { knownAcronyms: acronyms });
    if (findings.length === 0) continue;
    rows.push({
      measureId: measure.id,
      candidate: measure.candidacy?.politician?.lastName ?? null,
      state: published ? "PUBLISHED" : "DRAFT",
      text: revision.text.replace(/\s+/g, " ").trim(),
      findings,
    });
  }

  if (parsed.json === true) {
    console.log(
      JSON.stringify(
        { electionSlug, scanned: measures.length, flagged: rows.length, rows },
        null,
        2
      )
    );
  } else {
    const byRule = new Map<string, number>();
    for (const row of rows)
      for (const f of row.findings) byRule.set(f.rule, (byRule.get(f.rule) ?? 0) + 1);

    console.log(
      `[measures:audit-clarity] ${electionSlug} : ${measures.length} mesure(s) lues, ${rows.length} à relire`
    );
    for (const [rule, count] of [...byRule].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${count.toString().padStart(5)}  ${rule}`);
    }

    // By default only the findings that need a read; --indicatifs adds the weaker hints.
    const shown = (f: ClarityFinding) => parsed.indicatifs === true || f.severity === "A_RELIRE";
    const toRead = rows.filter((row) => row.findings.some(shown));
    const label = parsed.indicatifs === true ? "À examiner" : "À relire";
    console.log(`\n${label} (${toRead.length}), les ${Math.min(limit, toRead.length)} premières :`);
    for (const row of toRead.slice(0, limit)) {
      const marks = row.findings
        .filter(shown)
        .map((f) => `${f.rule} « ${f.match.slice(0, 50)} »`)
        .join(", ");
      console.log(
        `${row.measureId} | ${row.state} | ${row.candidate ?? "?"} | ${marks}\n    ${row.text.slice(0, 160)}`
      );
    }
  }

  if (
    parsed.strict === true &&
    rows.some((row) => row.findings.some((f) => f.severity === "A_RELIRE"))
  ) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
