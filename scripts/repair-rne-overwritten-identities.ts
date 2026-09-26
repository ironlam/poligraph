/**
 * Repair the civil statuses the RNE sync wrote onto the wrong person.
 *
 * `updateExistingMaire` used to find a mandate by INSEE code alone, with no notion of who held
 * it, then write the register row's `civility` and `birthDate` onto that mandate's politician.
 * When a commune changed mayor, the successor's civil status landed on the predecessor's
 * profile.
 *
 * The signature of such a row is a birth date that matches the register exactly while the
 * holder is demonstrably someone else.
 *
 * "Demonstrably" is the whole difficulty. A name that merely fails to match is not enough: the
 * register writes civil names where we often hold usage names, so a widened surname or an
 * extra given name looks like a mismatch and is not one. Only a `DIFFERENT` verdict, which
 * requires two unrelated surnames, is acted on. `UNDECIDED` rows are listed for a human and
 * never touched: erasing them would destroy correct data on the strength of a spelling.
 *
 * Under `--apply` the acted-on profiles have `birthDate` and `civility` set back to `null`.
 * They belong to someone else, and no source gives us the original holder's own.
 *
 * Usage:
 *   NEXT_PUBLIC_SENTRY_ENABLED=false npx tsx --env-file=.env scripts/repair-rne-overwritten-identities.ts
 *   NEXT_PUBLIC_SENTRY_ENABLED=false npx tsx --env-file=.env scripts/repair-rne-overwritten-identities.ts --only=slug-a,slug-b --apply
 *
 * `--apply` requires `--only`. Erasing a civil status is irreversible and the list is meant to
 * be arbitrated row by row, so there is no way to wipe every row with one flag.
 */

import { parse } from "csv-parse/sync";

import { HTTPClient } from "@/lib/api/http-client";
import { db } from "@/lib/db";
import { DATA_GOUV_RATE_LIMIT_MS } from "@/config/rate-limits";
import { parisCalendarDay, parseMaireRows } from "@/services/sync/rne-parse";
import { compareHolder } from "@/services/sync/rne-holder";
import { RNE_MAIRES_FRAGMENTS, resolveRneResourceUrl } from "@/services/sync/rne-resource";
import type { MaireRNECSV } from "@/services/sync/types";

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const onlyArg = process.argv.find((arg) => arg.startsWith("--only="));
  const only = new Set(
    (onlyArg?.slice("--only=".length) ?? "")
      .split(",")
      .map((slug) => slug.trim())
      .filter(Boolean)
  );

  if (apply && only.size === 0) {
    console.error(
      "--apply exige --only=<slug,…> : ces effacements sont irréversibles et s'arbitrent ligne par ligne."
    );
    process.exitCode = 1;
    return;
  }

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

  type Suspect = {
    inseeCode: string;
    commune: string;
    politicianId: string;
    slug: string;
    base: string;
    registre: string;
    birthDate: string;
    civility: string;
    verdict: string;
    isCurrent: boolean;
  };

  const suspects: Suspect[] = [];
  const review: Suspect[] = [];
  const offByOne: Suspect[] = [];
  const seen = new Set<string>();
  for (const local of held) {
    const row = byInsee.get(local.rneExternalId!);
    if (!row) continue;

    const holder = local.mandate.politician;
    if (seen.has(local.mandate.politicianId)) continue;
    if (holder.birthDate === null || row.birthDate === null) continue;

    // Paris calendar day, never UTC: 34 664 of these birth dates are stored at Paris midnight,
    // which is 22:00Z or 23:00Z the day before. Reading them as UTC shifts every one of them
    // by a day, which both hides real matches and invents false ones.
    const day = parisCalendarDay(holder.birthDate);
    const registerDay = parisCalendarDay(row.birthDate);
    if (day !== registerDay) {
      // One day apart is the exact artefact a UTC reading produces on a Paris-midnight value.
      // Reported separately so a human can tell a genuine day of difference from a legacy
      // timezone bug, rather than have the distinction made silently here.
      const apart = Math.abs(holder.birthDate.getTime() - row.birthDate.getTime());
      if (apart > 36 * 3_600_000) continue;

      const near = compareHolder(
        { firstName: row.firstName, lastName: row.lastName, birthDate: row.birthDate },
        { firstName: holder.firstName, lastName: holder.lastName, birthDate: row.birthDate }
      );
      if (near !== "SAME") {
        offByOne.push({
          inseeCode: local.rneExternalId!,
          commune: row.communeLabel ?? "",
          politicianId: local.mandate.politicianId,
          slug: holder.slug,
          base: `${holder.firstName} ${holder.lastName}`,
          registre: `${row.firstName} ${row.lastName}`,
          birthDate: `${day} en base, ${registerDay} au registre`,
          civility: holder.civility ?? "",
          verdict: near,
          isCurrent: local.mandate.isCurrent,
        });
        seen.add(local.mandate.politicianId);
      }
      continue;
    }

    const verdict = compareHolder(
      { firstName: row.firstName, lastName: row.lastName, birthDate: row.birthDate },
      { firstName: holder.firstName, lastName: holder.lastName, birthDate: holder.birthDate }
    );
    if (verdict === "SAME") continue;

    const entry: Suspect = {
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
    };
    // UNDECIDED is a question, not a finding. Acting on it would erase the civil status of
    // people whose only fault is a name written two ways.
    if (verdict === "DIFFERENT") suspects.push(entry);
    else review.push(entry);
    seen.add(local.mandate.politicianId);
  }

  function show(entry: Suspect): void {
    console.log(`  ${entry.inseeCode}  ${entry.commune}`);
    console.log(`    base     : ${entry.base} (${entry.slug})`);
    console.log(`    registre : ${entry.registre}`);
    console.log(`    naissance écrite : ${entry.birthDate}   civilité : ${entry.civility}`);
    console.log(`    mandat courant : ${entry.isCurrent ? "oui" : "non"}\n`);
  }

  console.log(
    `${offByOne.length} fiche(s) à un jour d'écart, INTOUCHÉES (ambiguïté de fuseau héritée) :\n`
  );
  for (const entry of offByOne) show(entry);

  console.log(`${review.length} fiche(s) à arbitrer, INTOUCHÉES (verdict indécis) :\n`);
  for (const entry of review) show(entry);

  console.log(`${suspects.length} fiche(s) à effacer (deux noms sans rapport) :\n`);
  for (const entry of suspects) show(entry);

  if (suspects.length === 0) {
    console.log("Rien à effacer.");
    await db.$disconnect();
    return;
  }

  if (!apply) {
    console.log("Lecture seule. Relancer avec --apply pour effacer ces valeurs.");
    await db.$disconnect();
    return;
  }

  const unknown = [...only].filter((slug) => !suspects.some((s) => s.slug === slug));
  if (unknown.length > 0) {
    console.error(`Slugs absents de la liste à effacer : ${unknown.join(", ")}`);
    process.exitCode = 1;
    return;
  }

  let erased = 0;
  for (const entry of suspects) {
    if (!only.has(entry.slug)) continue;
    await db.politician.update({
      where: { id: entry.politicianId },
      data: { birthDate: null, civility: null },
    });
    console.log(`  Effacé : ${entry.slug}`);
    erased++;
  }
  console.log(`\n${erased} fiche(s) remises à null.`);

  await db.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
