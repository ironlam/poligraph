/**
 * Audit en lecture seule : les dates des mandats de sénateur (source SENAT) contre la
 * table officielle du Sénat (ODSEN_ELUSEN.csv).
 *
 * Pourquoi. Le sync a longtemps daté les remplaçants et la série 1 au 2020-10-01
 * (repli sur le début de la série 2). 158 dates fausses ont été corrigées le 2026-11-09 ;
 * ce script empêche le retour du défaut. Il ne corrige rien.
 *
 * Code de sortie 1 s'il reste une date de début ou de fin fausse, ou si la table
 * officielle est injoignable ou vide (un audit muet ne prouve rien).
 *
 * Usage :
 *   npm run audit:senat-mandate-dates
 *   npm run audit:senat-mandate-dates -- --verbose   (liste aussi les mandats non jugés)
 */

import "dotenv/config";
import { db } from "../src/lib/db";
import {
  ELUSEN_URL,
  auditMandate,
  parseElusen,
  toDay,
  type AuditResult,
} from "../src/lib/senat/mandate-dates-audit";

async function fetchOfficialTerms() {
  const response = await fetch(ELUSEN_URL);
  if (!response.ok) {
    throw new Error(`Table officielle indisponible : ${response.status} ${response.statusText}`);
  }
  // Le fichier est en ISO-8859-1.
  const csv = new TextDecoder("iso-8859-1").decode(await response.arrayBuffer());
  const terms = parseElusen(csv);
  if (terms.size < 500) {
    throw new Error(`Table officielle suspecte : ${terms.size} matricules seulement`);
  }
  return terms;
}

function describe(r: AuditResult): string {
  const m = r.mandate;
  const db = `${toDay(m.startDate)} → ${m.endDate ? toDay(m.endDate) : "en cours"}`;
  const off = r.official ? `${r.official.start} → ${r.official.end ?? "en cours"}` : "-";
  return `  ${r.matricule}  base ${db}  officiel ${off}`;
}

async function main() {
  const verbose = process.argv.includes("--verbose");
  const terms = await fetchOfficialTerms();

  const mandates = await db.mandate.findMany({
    where: { type: "SENATEUR", source: "SENAT", externalId: { startsWith: "senat-" } },
    select: { id: true, externalId: true, startDate: true, endDate: true, isCurrent: true },
  });

  const results = mandates.map((m) => auditMandate(m, terms));
  const by = (status: AuditResult["status"]) => results.filter((r) => r.status === status);
  const wrong = [...by("WRONG_START"), ...by("WRONG_END")];

  console.log("=== Audit des dates de mandats de sénateur ===\n");
  console.log(`Mandats SENAT audités : ${results.length}`);
  console.log(`  conformes            : ${by("OK").length}`);
  console.log(`  début faux           : ${by("WRONG_START").length}`);
  console.log(`  fin fausse           : ${by("WRONG_END").length}`);
  console.log(`  non jugés (plusieurs termes) : ${by("MULTI_TERM").length}`);
  console.log(`  sans terme officiel  : ${by("NO_TERM").length}`);
  console.log(`  matricule inconnu    : ${by("UNKNOWN_MATRICULE").length}`);

  if (wrong.length > 0) {
    console.log("\nÀ corriger :");
    for (const r of wrong) console.log(`${r.status}${describe(r)}`);
  }
  if (verbose) {
    for (const status of ["MULTI_TERM", "NO_TERM", "UNKNOWN_MATRICULE"] as const) {
      const list = by(status);
      if (list.length === 0) continue;
      console.log(`\n${status} :`);
      for (const r of list) console.log(describe(r));
    }
  }

  await db.$disconnect();
  if (wrong.length > 0) process.exit(1);
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
