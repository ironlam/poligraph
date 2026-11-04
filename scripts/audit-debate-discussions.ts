/** Bounded, offline coverage diagnostic. XML-derived candidates are not proven
 * scrutin/amendment links. No database, network or model calls. */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { extractSeanceFromXml } from "../src/services/sync/debate-transcript-parse";
import { extractText } from "../src/lib/parsing/html-utils";
import { inspectAmendmentDiscussion } from "../src/services/scrutin-substance/debate-discussion";

function option(name: string): string | undefined {
  const at = process.argv.indexOf(`--${name}`);
  return at < 0 ? undefined : process.argv[at + 1];
}
function* xmlFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name)
  )) {
    if (entry.isDirectory()) yield* xmlFiles(join(dir, entry.name));
    else if (entry.isFile() && entry.name.endsWith(".xml")) yield join(dir, entry.name);
  }
}
const dir = option("xml");
const limit = Number(option("limit") ?? 8);
const perSeance = Number(option("targets") ?? 30);
if (
  !dir ||
  !Number.isInteger(limit) ||
  limit < 1 ||
  limit > 20 ||
  !Number.isInteger(perSeance) ||
  perSeance < 1 ||
  perSeance > 100
) {
  throw new Error(
    "Usage: audit:debate-discussions -- --xml DIRECTORY [--limit 1..20] [--targets 1..100]"
  );
}
const rows = [];
let filesRead = 0;
for (const file of xmlFiles(dir)) {
  if (filesRead++ >= limit) break;
  const xml = readFileSync(file, "utf8");
  const seance = extractSeanceFromXml(xml);
  if (!seance) continue;
  const candidates = new Map<string, { number: string; texteRef: string; subAmendment: boolean }>();
  for (const p of seance.paragraphs) {
    if (!p.textNumber) continue;
    for (const [numbers, subAmendment] of [
      [p.amendments, false],
      [p.subAmendments, true],
    ] as const) {
      for (const number of numbers) {
        if (!/^(?:[a-z]{1,2}-)?[a-z]{0,3}\d+$/i.test(number)) continue;
        const n = p.budgetPart && /^\d+$/.test(number) ? `${p.budgetPart}-${number}` : number;
        const key = `${p.textNumber}:${n}:${subAmendment}`;
        candidates.set(key, { number: n, texteRef: `B${p.textNumber}`, subAmendment });
      }
    }
  }
  const excluded: Record<string, number> = {};
  const examples: Record<string, string> = {};
  let eligible = 0;
  let withSuspension = 0;
  const selected = [...candidates.values()].slice(0, perSeance);
  for (const target of selected) {
    const inspection = inspectAmendmentDiscussion(seance.paragraphs, target);
    if (inspection.discussion) {
      eligible++;
      if (inspection.discussion.paragraphs.some((p) => /la séance est suspendue/i.test(p.text))) {
        withSuspension++;
        examples.suspensionWithinEpisode ??= target.number;
      }
    } else {
      const reason = inspection.exclusion;
      excluded[reason] = (excluded[reason] ?? 0) + 1;
      examples[reason] ??= target.number;
    }
  }
  const midnightStatements = [...xml.matchAll(/<texte\b[^>]*>([\s\S]*?)<\/texte>/g)]
    .map((m) => extractText(m[1]!))
    .filter(
      (t) => /^\(La séance/.test(t) && /à\s+(?:minuit|zéro heure|une heure|deux heures)/.test(t)
    );
  rows.push({
    uid: xml.match(/<uid>([^<]+)/)?.[1],
    date: seance.date.toISOString().slice(0, 10),
    paragraphs: seance.paragraphs.length,
    suspensionParagraphs: [...xml.matchAll(/<paragraphe\b[^>]*code_grammaire="SUSP_SEA/g)].length,
    rappelParagraphs: [...xml.matchAll(/<paragraphe\b[^>]*code_grammaire="RAP_REGLEMENT/g)].length,
    midnightStatements,
    candidates: candidates.size,
    scanned: selected.length,
    capped: candidates.size > selected.length,
    eligible,
    withSuspension,
    excluded,
    examples,
    sourceUrl: seance.sourceUrl,
  });
}
// eslint-disable-next-line no-console
console.log(
  JSON.stringify({ scope: "XML-only, bounded candidates; not production coverage", rows }, null, 2)
);
