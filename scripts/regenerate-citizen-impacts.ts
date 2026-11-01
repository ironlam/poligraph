/**
 * Regenerates, one batch at a time, the citizen impacts published before the debate
 * and grounding fixes: they carried a "Le débat" section with no source behind it.
 *
 * Two steps, so that what is written is exactly what was read:
 *
 *   1. npx tsx scripts/regenerate-citizen-impacts.ts [--limit=100] [--before=2026-10-30]
 *      Generates the next batch WITHOUT writing to the database, and writes a review
 *      (JSON + Markdown, old text next to the new one) under ~/Documents/poligraph.
 *
 *   2. npx tsx scripts/regenerate-citizen-impacts.ts --apply-from=<review.json> [--reject=id,id]
 *      Writes the generated texts of that review, as they were reviewed, and records the
 *      batch in the ledger so the next run moves on. A text refused by a guard
 *      (coherence, unknown names) keeps its old version and is recorded as handled.
 *
 * No page is revalidated: pages follow their normal cache expiry (never a mass revalidate).
 * The database is the production one.
 */
import "dotenv/config";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { db } from "../src/lib/db";
import {
  generateScrutinCitizenImpacts,
  type CitizenImpactOutcome,
  type CitizenImpactOutcomeRow,
} from "../src/services/sync/generate-scrutin-citizen-impacts";

const DEFAULT_BEFORE = "2026-10-30";
const DEFAULT_LIMIT = 100;
const WORK_DIR = join(homedir(), "Documents", "poligraph");
const LEDGER_PATH = join(WORK_DIR, "impact-regeneration-ledger.json");

interface Ledger {
  handled: Record<string, { outcome: string; at: string }>;
}

interface ReviewRow extends Omit<CitizenImpactOutcomeRow, "outcome"> {
  outcome: CitizenImpactOutcome | "not_eligible";
  votingDate: string;
  previousText: string;
}

interface ReviewFile {
  createdAt: string;
  before: string;
  rows: ReviewRow[];
}

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
}

function readLedger(): Ledger {
  if (!existsSync(LEDGER_PATH)) return { handled: {} };
  return JSON.parse(readFileSync(LEDGER_PATH, "utf-8")) as Ledger;
}

function writeLedger(ledger: Ledger): void {
  mkdirSync(WORK_DIR, { recursive: true });
  writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 1));
}

const OUTCOME_LABEL: Record<string, string> = {
  generated: "à écrire",
  incoherent: "refusé (cohérence)",
  ungrounded: "refusé (noms absents des sources)",
  low_confidence: "refusé (confiance faible)",
  no_substance: "ignoré (texte de l'amendement absent)",
  missing: "introuvable",
  error: "erreur",
  not_eligible: "hors périmètre du générateur",
};

function toMarkdown(review: ReviewFile): string {
  const counts: Record<string, number> = {};
  for (const r of review.rows) counts[r.outcome] = (counts[r.outcome] ?? 0) + 1;
  const lines = [
    `# Régénération des impacts citoyens, lot du ${review.createdAt.slice(0, 10)}`,
    "",
    `Votes d'avant le ${review.before}. ${review.rows.length} traités : ` +
      Object.entries(counts)
        .map(([k, v]) => `${v} ${OUTCOME_LABEL[k] ?? k}`)
        .join(", ") +
      ".",
    "",
  ];
  for (const r of review.rows) {
    lines.push(`## ${r.votingDate} · ${OUTCOME_LABEL[r.outcome] ?? r.outcome}`);
    lines.push(`\`${r.id}\` · ${r.title ?? ""}`);
    if (r.detail) lines.push(`> ${r.detail}`);
    if (r.text) {
      lines.push("", "**Nouveau texte**", "", r.text, "", "**Texte actuel**", "", r.previousText);
    }
    lines.push("");
  }
  return lines.join("\n");
}

async function review(): Promise<void> {
  const limit = Number(arg("limit") ?? DEFAULT_LIMIT);
  const before = arg("before") ?? DEFAULT_BEFORE;
  const ledger = readLedger();
  const done = Object.keys(ledger.handled);

  const candidates = await db.scrutin.findMany({
    where: {
      citizenImpact: { not: null },
      summary: { not: null },
      votingDate: { lt: new Date(`${before}T00:00:00Z`) },
      ...(done.length > 0 ? { id: { notIn: done } } : {}),
    },
    orderBy: [{ votingDate: "desc" }, { id: "asc" }],
    take: limit,
    select: { id: true, votingDate: true, citizenImpact: true },
  });
  console.log(
    `${candidates.length} votes d'avant le ${before} à traiter (${done.length} déjà traités).`
  );
  if (candidates.length === 0) return;

  const byId = new Map(candidates.map((c) => [c.id, c]));
  const result = await generateScrutinCitizenImpacts({
    scrutinIds: candidates.map((c) => c.id),
    force: true,
    dryRun: true,
  });

  const rows: ReviewRow[] = result.outcomes.map((o) => ({
    ...o,
    votingDate: byId.get(o.id)?.votingDate.toISOString().slice(0, 10) ?? "",
    previousText: byId.get(o.id)?.citizenImpact ?? "",
  }));
  // The generator only looks at votes it can describe: the others are handled too,
  // otherwise they would be picked again by every batch.
  const seen = new Set(rows.map((r) => r.id));
  for (const c of candidates) {
    if (seen.has(c.id)) continue;
    rows.push({
      id: c.id,
      slug: null,
      title: null,
      outcome: "not_eligible",
      votingDate: c.votingDate.toISOString().slice(0, 10),
      previousText: c.citizenImpact ?? "",
    });
  }

  const file: ReviewFile = { createdAt: new Date().toISOString(), before, rows };
  mkdirSync(WORK_DIR, { recursive: true });
  const stamp = file.createdAt.slice(0, 19).replace(/[:T]/g, "-");
  const jsonPath = join(WORK_DIR, `impact-regeneration-${stamp}.json`);
  const mdPath = join(WORK_DIR, `impact-regeneration-${stamp}.md`);
  writeFileSync(jsonPath, JSON.stringify(file, null, 1));
  writeFileSync(mdPath, toMarkdown(file));

  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.outcome] = (counts[r.outcome] ?? 0) + 1;
  console.log("Résultat :", counts);
  console.log(`Revue : ${mdPath}`);
  console.log(`Pour écrire : --apply-from=${jsonPath}`);
}

async function apply(path: string): Promise<void> {
  const file = JSON.parse(readFileSync(path, "utf-8")) as ReviewFile;
  const rejected = new Set((arg("reject") ?? "").split(",").filter(Boolean));
  const ledger = readLedger();
  let written = 0;
  let alreadyApplied = 0;
  let changedSince = 0;

  try {
    for (const r of file.rows) {
      let outcome: string = r.outcome;
      if (r.outcome === "generated" && r.text && !rejected.has(r.id)) {
        const current = await db.scrutin.findUnique({
          where: { id: r.id },
          select: { citizenImpact: true },
        });
        if (current?.citizenImpact === r.text) {
          // Replay of a run that stopped half way: this row is already written.
          alreadyApplied++;
        } else {
          // Only if the text is still the one the review was made against.
          const res = await db.scrutin.updateMany({
            where: { id: r.id, citizenImpact: r.previousText },
            data: { citizenImpact: r.text, citizenImpactDate: new Date() },
          });
          if (res.count === 1) written++;
          else {
            changedSince++;
            outcome = "changed_since_review";
          }
        }
      } else if (r.outcome === "generated") {
        outcome = "rejected_by_reviewer";
      }
      if (outcome === "error" || outcome === "missing" || outcome === "changed_since_review") {
        continue;
      }
      ledger.handled[r.id] = { outcome, at: new Date().toISOString() };
      // Saved row by row: a failure later in the batch must not lose what is done.
      writeLedger(ledger);
    }
  } finally {
    writeLedger(ledger);
  }
  console.log(
    `${written} impacts écrits, ${alreadyApplied} déjà en place, ${rejected.size} écartés par la revue, ${changedSince} modifiés depuis la revue (non écrits, à refaire).`
  );
  console.log(`Ledger : ${Object.keys(ledger.handled).length} votes traités.`);
}

async function main(): Promise<void> {
  const applyFrom = arg("apply-from");
  if (applyFrom) await apply(applyFrom);
  else await review();
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
