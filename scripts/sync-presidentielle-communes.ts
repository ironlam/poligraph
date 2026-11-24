/**
 * Import presidential results by commune (ministère de l'Intérieur, data.gouv.fr).
 *
 * Usage:
 *   npm run sync:presidentielle-communes -- --election=presidentielle-2022 --round=1 --dry-run
 *   npm run sync:presidentielle-communes -- --election=presidentielle-2022 --round=1
 *   ... --file=<local path or data.gouv.fr URL>   (defaults to src/config/presidentielle-communes.ts)
 *
 * Run the national correction of the election first: the consistency check compares the sum of
 * commune votes with the national votes recorded on each candidacy.
 *
 * Writes nothing with --dry-run. Without it, replaces the round in one transaction and records the
 * import in SyncMetadata. Purges no cache: the commune pages pick the results up at the next purge
 * of the "elections" or "territoires" tag.
 */

import "dotenv/config";
import { readFileSync } from "node:fs";
import { db } from "@/lib/db";
import { PRESIDENTIELLE_COMMUNES_SOURCES } from "@/config/presidentielle-communes";
import { recordEvenements, resultatElectionEvenement } from "@/services/sync/territoire-evenements";
import {
  buildImportPlan,
  decodeResultsFile,
  downloadResultsFile,
  normalizeCandidateName,
  parseResultsFile,
  toInseeCode,
  writeImportPlan,
  type ImportPlan,
} from "@/services/sync/presidentielle-communes";

function arg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
}

const DRY_RUN = process.argv.includes("--dry-run");
const fr = (n: number) => n.toLocaleString("fr-FR");

function pct(part: number, total: number): string {
  return total === 0 ? "n/a" : `${((part / total) * 100).toFixed(2)} %`;
}

function printTerritories(plan: ImportPlan, missingByDept: Map<string, string[]>) {
  const entries = [...plan.territories.entries()].sort(([a], [b]) => a.localeCompare(b));
  const metro = entries.filter(([code]) => /^([0-9]{2}|2[AB])$/.test(code));
  const others = entries.filter(([code]) => !/^([0-9]{2}|2[AB])$/.test(code));

  const read = metro.reduce((s, [, t]) => s + t.linesRead, 0);
  const matched = metro.reduce((s, [, t]) => s + t.matched, 0);
  console.log(
    `\nMétropole et Corse : ${fr(matched)} / ${fr(read)} lignes rapprochées (${pct(matched, read)})`
  );
  for (const [code, t] of metro.filter(([, t]) => t.unmatched.length > 0)) {
    console.log(`  ${code} ${t.label} : ${t.unmatched.length} non rapprochée(s)`);
    for (const u of t.unmatched.slice(0, 10)) console.log(`      ${u}`);
    if (t.unmatched.length > 10) console.log(`      ... ${t.unmatched.length - 10} de plus`);
  }

  console.log("\nOutre-mer et Français de l'étranger (détail par code du ministère) :");
  for (const [code, t] of others) {
    console.log(
      `  ${code} ${t.label} : ${t.matched} / ${t.linesRead} rapprochée(s) (${pct(t.matched, t.linesRead)})`
    );
    for (const u of t.unmatched) console.log(`      ${u}`);
  }

  const missing = [...missingByDept.entries()].sort(([a], [b]) => a.localeCompare(b));
  const totalMissing = missing.reduce((s, [, l]) => s + l.length, 0);
  console.log(`\nCommunes du référentiel sans ligne dans le fichier : ${fr(totalMissing)}`);
  for (const [dept, codes] of missing) {
    const sample = codes.slice(0, 8).join(", ");
    console.log(`  ${dept} : ${codes.length} (${sample}${codes.length > 8 ? ", ..." : ""})`);
  }
}

async function main() {
  const electionSlug = arg("election");
  const round = Number(arg("round"));
  if (!electionSlug || (round !== 1 && round !== 2)) {
    throw new Error("Paramètres attendus : --election=<slug> --round=1|2 [--file=...] [--dry-run]");
  }
  const config = PRESIDENTIELLE_COMMUNES_SOURCES[electionSlug];
  const roundSource = config?.rounds[round];
  const file = arg("file") ?? roundSource?.fileUrl;
  if (!config || !file) {
    throw new Error(
      `Aucune source déclarée pour ${electionSlug}, tour ${round} (src/config/presidentielle-communes.ts)`
    );
  }

  const election = await db.election.findUnique({
    where: { slug: electionSlug },
    select: { id: true, type: true, title: true, round1Date: true, round2Date: true },
  });
  if (!election || election.type !== "PRESIDENTIELLE") {
    throw new Error(`Élection présidentielle introuvable : ${electionSlug}`);
  }
  const candidacies = await db.candidacy.findMany({
    where: { electionId: election.id },
    select: { id: true, candidateName: true, round1Votes: true, round2Votes: true },
    take: 100,
  });

  const communeCount = await db.commune.count();
  console.log(`${election.title}, tour ${round}${DRY_RUN ? " (DRY RUN, aucune écriture)" : ""}`);
  console.log(`Source : ${file}`);
  console.log(`Référentiel : ${fr(communeCount)} communes, ${candidacies.length} candidatures`);
  const communes = await db.commune.findMany({
    select: { id: true, departmentCode: true, name: true },
    take: communeCount,
  });

  const buffer = /^https?:\/\//.test(file)
    ? await downloadResultsFile(file)
    : new Uint8Array(readFileSync(file));
  const rows = parseResultsFile(decodeResultsFile(buffer));
  const plan = buildImportPlan(rows, new Set(communes.map((c) => c.id)), candidacies);

  console.log(
    `\nLignes lues : ${fr(plan.linesRead)} (dont ${plan.abroadLines} Français de l'étranger, exclus)`
  );
  console.log(`Communes rapprochées : ${fr(plan.communeRounds.length)}`);
  console.log(`Lignes de voix à écrire : ${fr(plan.results.length)}`);
  if (plan.duplicates.length > 0) console.log(`Doublons : ${plan.duplicates.join(" ; ")}`);

  const imported = new Set(plan.communeRounds.map((r) => r.communeId));
  const missingByDept = new Map<string, string[]>();
  for (const c of communes) {
    if (imported.has(c.id)) continue;
    missingByDept.set(c.departmentCode, [...(missingByDept.get(c.departmentCode) ?? []), c.id]);
  }
  printTerritories(plan, missingByDept);

  // A commune that absorbed others since the election keeps its code under a new name: its
  // results are those of the former, smaller commune. Listed so the operator can see them.
  // Ligatures and "Cheylard (Le)" are spelling, not a new perimeter: compared away.
  const placeKey = (name: string) =>
    normalizeCandidateName(
      name
        .replace(/œ/g, "oe")
        .replace(/Œ/g, "OE")
        .replace(/^(.*) \((Le|La|Les|L')\)$/, "$2 $1")
    );
  const nameByCode = new Map(communes.map((c) => [c.id, c.name]));
  const renamed = rows.flatMap((row) => {
    const key = toInseeCode(row.departmentCode, row.communeCode);
    if (key.kind !== "commune") return [];
    const current = nameByCode.get(key.inseeCode);
    return current && placeKey(current) !== placeKey(row.communeLabel)
      ? [`${key.inseeCode} ${row.communeLabel} -> ${current}`]
      : [];
  });
  console.log(`\nCommunes rapprochées dont le nom a changé depuis le scrutin : ${renamed.length}`);
  for (const r of renamed.slice(0, 40)) console.log(`  ${r}`);
  if (renamed.length > 40) console.log(`  ... ${renamed.length - 40} de plus`);

  console.log("\nCohérence par candidat (voix) :");
  console.log(
    "  candidat | national en base | communes rapprochées | étranger (ZZ) | lignes non rapprochées | écart national - communes | reste inexpliqué"
  );
  for (const c of plan.candidates) {
    const candidacy = candidacies.find((x) => x.id === c.candidacyId);
    const national = candidacy
      ? round === 1
        ? candidacy.round1Votes
        : candidacy.round2Votes
      : null;
    const gap = national != null ? national - c.matchedVotes : null;
    const rest = gap != null ? gap - c.abroadVotes - c.unmatchedVotes : null;
    console.log(
      `  ${c.name}${c.candidacyId ? "" : " (CANDIDATURE INTROUVABLE)"} | ${national != null ? fr(national) : "non renseigné"} | ${fr(c.matchedVotes)} | ${fr(c.abroadVotes)} | ${fr(c.unmatchedVotes)} | ${gap != null ? fr(gap) : "n/a"} | ${rest != null ? fr(rest) : "n/a"}`
    );
  }

  const blocking = [
    ...plan.unmatchedCandidates.map((n) => `candidat sans candidature : ${n}`),
    ...plan.duplicates.map((d) => `commune en double : ${d}`),
    ...(plan.communeRounds.length === 0 ? ["aucune commune rapprochée"] : []),
  ];
  if (blocking.length > 0) {
    console.log(`\nBLOQUANT, aucune écriture possible :\n  ${blocking.join("\n  ")}`);
    process.exitCode = 1;
    return;
  }
  if (DRY_RUN) {
    console.log("\nDry run : rien n'a été écrit.");
    return;
  }

  const t0 = Date.now();
  const written = await writeImportPlan({
    electionId: election.id,
    electionSlug,
    round: round as 1 | 2,
    plan,
    fileUrl: file,
  });
  console.log(
    `\nÉcrit : ${fr(written.communeRounds)} participations, ${fr(written.results)} lignes de voix en ${((Date.now() - t0) / 1000).toFixed(1)} s`
  );

  const roundDate = round === 1 ? election.round1Date : election.round2Date;
  if (roundDate) {
    const fil = await recordEvenements(
      plan.communeRounds.map((r) =>
        resultatElectionEvenement({
          inseeCode: r.communeId,
          electionSlug,
          electionLabel: election.title,
          tour: round as 1 | 2,
          roundDate,
          sourceLabel: "Ministère de l'Intérieur",
          sourceUrl: file,
        })
      )
    );
    console.log(
      `Fil du territoire : ${fr(fil.written)} événements écrits, ${fr(fil.rejected)} écartés (fichier local ou contenu invalide)`
    );
  }
}

main()
  .catch((err) => {
    console.error("Erreur :", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
