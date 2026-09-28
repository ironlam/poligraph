/**
 * Undo the two things the first full RNE run wrote without evidence.
 *
 * **Mandates closed for being absent from the register.** Phase 3 closed 130 mayoral mandates
 * because their commune was missing from the August file, and stamped each with the millisecond
 * the script ran. Batzendorf (67023) is a real commune absent from that file: its mayor was
 * closed for a gap in the source. An absence is not an end, and "when I looked" is not a date.
 * They are reopened, and Phase 3 now reports instead of closing.
 *
 * **Mandates attached to a namesake born the same day.** A rule confirmed a holder on a matching
 * birth date without looking at the first name, so six communes had their mandate attached to
 * someone else's profile: Dany Vasseur's to Jérôme Vasseur, Éric Martin's to Xavier Martin. The
 * mandate and its local row are removed; the commune goes back to having no mayor, which is
 * where it was before the run, and the next sync reports it rather than guessing again.
 *
 * Usage:
 *   NEXT_PUBLIC_SENTRY_ENABLED=false npx tsx --env-file=.env scripts/repair-rne-run-20260928.ts
 *   NEXT_PUBLIC_SENTRY_ENABLED=false npx tsx --env-file=.env scripts/repair-rne-run-20260928.ts --apply
 */

import { parse } from "csv-parse/sync";

import { MandateType } from "@/generated/prisma";

import { HTTPClient } from "@/lib/api/http-client";
import { db } from "@/lib/db";
import { compareHolder } from "@/services/sync/rne-holder";
import { parseMaireRows } from "@/services/sync/rne-parse";
import { RNE_MAIRES_FRAGMENTS, resolveRneResourceUrl } from "@/services/sync/rne-resource";
import type { MaireRNECSV } from "@/services/sync/types";

/** The window the run wrote in. Its Phase 3 stamped `new Date()`, nothing else did. */
const RUN_START = new Date("2026-09-27T20:00:00Z");

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");

  // ── Closures with the run's own timestamp ──────────────────────────────────────────────
  const closedByRun = await db.mandate.findMany({
    where: {
      type: MandateType.MAIRE,
      isCurrent: false,
      endDate: { gte: RUN_START },
      localData: { isNot: null },
    },
    select: {
      id: true,
      endDate: true,
      politician: { select: { slug: true } },
      localData: { select: { communeId: true } },
    },
  });
  console.log(`Fermés par la Phase 3 avec l'horodatage du run : ${closedByRun.length}`);
  for (const mandate of closedByRun.slice(0, 5)) {
    console.log(`  ${mandate.politician.slug} (${mandate.localData?.communeId ?? "?"})`);
  }

  // ── Mandates attached to a namesake born the same day ──────────────────────────────────
  const registerUrl = await resolveRneResourceUrl(RNE_MAIRES_FRAGMENTS);
  const { data: csvText } = await new HTTPClient({ rateLimitMs: 0 }).getText(registerUrl);
  const records = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    delimiter: ";",
    bom: true,
  }) as MaireRNECSV[];
  const communes = await db.commune.findMany({ select: { id: true } });
  const parsed = parseMaireRows(records, new Set(communes.map((commune) => commune.id)));
  const rowByInsee = new Map(parsed.rows.map((row) => [row.inseeCode, row]));

  const created = await db.mandateLocal.findMany({
    where: {
      rneExternalId: { not: null },
      mandate: { type: MandateType.MAIRE, isCurrent: true, createdAt: { gte: RUN_START } },
    },
    select: {
      id: true,
      rneExternalId: true,
      mandate: {
        select: {
          id: true,
          politicianId: true,
          politician: {
            select: { slug: true, firstName: true, lastName: true, birthDate: true },
          },
        },
      },
    },
  });

  const misattached: { mandateId: string; localId: string; politicianId: string; label: string }[] =
    [];
  for (const local of created) {
    const row = rowByInsee.get(local.rneExternalId!);
    if (!row) continue;
    const holder = local.mandate.politician;
    if (row.birthDate === null || holder.birthDate === null) continue;

    // The verdict the corrected rule gives. Anything it no longer confirms was attached on a
    // rule that did not look at the first name.
    const verdict = compareHolder(
      { firstName: row.firstName, lastName: row.lastName, birthDate: row.birthDate },
      holder
    );
    if (verdict !== "UNDECIDED") continue;

    misattached.push({
      mandateId: local.mandate.id,
      localId: local.id,
      politicianId: local.mandate.politicianId,
      label: `${local.rneExternalId} registre="${row.firstName} ${row.lastName}" fiche="${holder.firstName} ${holder.lastName}" (${holder.slug})`,
    });
  }

  console.log(`\nMandats attachés à un homonyme né le même jour : ${misattached.length}`);
  for (const entry of misattached) console.log(`  ${entry.label}`);

  if (!apply) {
    console.log("\nLecture seule. Relancer avec --apply.");
    await db.$disconnect();
    return;
  }

  let reopened = 0;
  for (const mandate of closedByRun) {
    const result = await db.mandate.updateMany({
      where: { id: mandate.id, isCurrent: false },
      data: { isCurrent: true, endDate: null },
    });
    reopened += result.count;
  }
  console.log(`\n${reopened} mandats rouverts.`);

  let detached = 0;
  for (const entry of misattached) {
    // The local row first: it carries the foreign key.
    await db.mandateLocal.delete({ where: { id: entry.localId } });
    await db.mandate.delete({ where: { id: entry.mandateId } });
    detached++;
  }
  console.log(`${detached} mandats mal attachés supprimés.`);

  await db.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
