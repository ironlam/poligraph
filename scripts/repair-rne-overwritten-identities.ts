/**
 * Repair the civil statuses the RNE sync wrote onto the wrong person.
 *
 * `updateExistingMaire` used to find a mandate by INSEE code alone, with no notion of who held
 * it, then write the register row's `civility` and `birthDate` onto that mandate's politician.
 * When a commune changed mayor, the successor's civil status landed on the predecessor's
 * profile.
 *
 * The signature of such a row is a name that no longer matches the register while the birth
 * date matches it exactly: the birth date could only have come from the register.
 *
 * Under `--apply` the affected profiles have `birthDate` and `civility` set back to `null`.
 * They belong to someone else, and no source gives us the original holder's own.
 *
 * Usage:
 *   NEXT_PUBLIC_SENTRY_ENABLED=false npx tsx --env-file=.env scripts/repair-rne-overwritten-identities.ts
 *   NEXT_PUBLIC_SENTRY_ENABLED=false npx tsx --env-file=.env scripts/repair-rne-overwritten-identities.ts --apply
 */

import { parse } from "csv-parse/sync";

import { HTTPClient } from "@/lib/api/http-client";
import { db } from "@/lib/db";
import { DATA_GOUV_RATE_LIMIT_MS } from "@/config/rate-limits";
import { parseMaireRows } from "@/services/sync/rne-parse";
import { compareHolder } from "@/services/sync/rne-holder";
import { RNE_MAIRES_FRAGMENTS, resolveRneResourceUrl } from "@/services/sync/rne-resource";
import type { MaireRNECSV } from "@/services/sync/types";

/** Same calendar day, whatever the time component each source stored. */
function sameDay(a: Date | null, b: Date | null): boolean {
  if (a === null || b === null) return false;
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");

  const url = await resolveRneResourceUrl(RNE_MAIRES_FRAGMENTS);
  console.log(`Registre : ${url}`);
  const { data: csvText } = await new HTTPClient({ rateLimitMs: DATA_GOUV_RATE_LIMIT_MS }).getText(
    url
  );
  const records = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    delimiter: ";",
    bom: true,
  }) as MaireRNECSV[];

  const communes = await db.commune.findMany({ select: { id: true } });
  const parsed = parseMaireRows(records, new Set(communes.map((c) => c.id)));
  const byInsee = new Map(parsed.rows.map((row) => [row.inseeCode, row]));
  console.log(`  ${parsed.rows.length} lignes de registre exploitables`);

  // Every mandate ever imported under an INSEE code, closed ones included: the overwrite
  // landed on the Politician, and closing their mandate afterwards did not give them their
  // own birth date back.
  const held = await db.mandateLocal.findMany({
    where: { rneExternalId: { not: null } },
    select: {
      rneExternalId: true,
      mandate: {
        select: {
          politicianId: true,
          isCurrent: true,
          politician: {
            select: {
              slug: true,
              firstName: true,
              lastName: true,
              birthDate: true,
              civility: true,
            },
          },
        },
      },
    },
  });
  console.log(`  ${held.length} mandats issus du registre en base\n`);

  const suspects = [];
  const seen = new Set<string>();
  for (const local of held) {
    const row = byInsee.get(local.rneExternalId!);
    if (!row) continue;

    const holder = local.mandate.politician;
    if (seen.has(local.mandate.politicianId)) continue;
    // The birth date is the tell: it matches the register exactly while the name does not.
    if (!sameDay(holder.birthDate, row.birthDate)) continue;

    const verdict = compareHolder(
      { firstName: row.firstName, lastName: row.lastName, birthDate: row.birthDate },
      { firstName: holder.firstName, lastName: holder.lastName, birthDate: holder.birthDate }
    );
    if (verdict === "SAME") continue;

    suspects.push({
      inseeCode: local.rneExternalId!,
      commune: row.communeLabel ?? "",
      politicianId: local.mandate.politicianId,
      slug: holder.slug,
      base: `${holder.firstName} ${holder.lastName}`,
      registre: `${row.firstName} ${row.lastName}`,
      birthDate: holder.birthDate?.toISOString().slice(0, 10) ?? "",
      civility: holder.civility ?? "",
      verdict,
      isCurrent: local.mandate.isCurrent,
    });
    seen.add(local.mandate.politicianId);
  }

  if (suspects.length === 0) {
    console.log("Aucune fiche suspecte.");
    await db.$disconnect();
    return;
  }

  console.log(
    `${suspects.length} fiche(s) dont la naissance vient du registre mais pas le nom :\n`
  );
  for (const s of suspects) {
    console.log(`  ${s.inseeCode}  ${s.commune}`);
    console.log(`    base     : ${s.base} (${s.slug})`);
    console.log(`    registre : ${s.registre}`);
    console.log(`    naissance écrite : ${s.birthDate}   civilité : ${s.civility}`);
    console.log(`    verdict  : ${s.verdict}   mandat courant : ${s.isCurrent ? "oui" : "non"}\n`);
  }

  if (!apply) {
    console.log("Lecture seule. Relancer avec --apply pour effacer ces valeurs.");
    await db.$disconnect();
    return;
  }

  for (const s of suspects) {
    await db.politician.update({
      where: { id: s.politicianId },
      data: { birthDate: null, civility: null },
    });
    console.log(`  Effacé : ${s.slug}`);
  }
  console.log(`\n${suspects.length} fiche(s) remises à null.`);

  await db.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
