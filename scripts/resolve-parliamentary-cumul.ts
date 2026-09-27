/**
 * Close the mayoral mandates of people who are demonstrably still sitting in parliament.
 *
 * A member of parliament cannot also be mayor, and the database shows both as current for a
 * handful of people because nobody publishes which way the option went. `decideCumul` reads the
 * one piece of evidence we hold: a vote cast after the option period closed proves the seat was
 * kept, so the mayoral mandate is the stale one.
 *
 * A vote only settles anything when nothing else speaks for the local mandate. So this reads the
 * register too, and takes its publication date as the date the local mandate was last confirmed:
 * the register naming someone mayor after the option deadline contradicts the vote, and two
 * recent sources that disagree are a question for a human.
 *
 * Rows without usable evidence are printed and left alone. A senator with no recent vote is a gap
 * in our vote coverage, which stops in July 2025, not a resignation.
 *
 * Usage:
 *   NEXT_PUBLIC_SENTRY_ENABLED=false npx tsx --env-file=.env scripts/resolve-parliamentary-cumul.ts
 *   NEXT_PUBLIC_SENTRY_ENABLED=false npx tsx --env-file=.env scripts/resolve-parliamentary-cumul.ts --apply
 */

import { parse } from "csv-parse/sync";

import { MandateType } from "@/generated/prisma";

import { HTTPClient } from "@/lib/api/http-client";
import { db } from "@/lib/db";
import { decideCumul } from "@/lib/mandates/cumul-evidence";
import { RNE_MAIRES_FRAGMENTS, resolveRneResourceUrl } from "@/services/sync/rne-resource";
import type { MaireRNECSV } from "@/services/sync/types";

const PARLIAMENTARY = [MandateType.DEPUTE, MandateType.SENATEUR];

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");

  const parliamentary = await db.mandate.findMany({
    where: { type: { in: PARLIAMENTARY }, isCurrent: true },
    select: { politicianId: true, type: true },
  });
  const chamberByPolitician = new Map(parliamentary.map((m) => [m.politicianId, m.type]));

  const localMandates = await db.mandate.findMany({
    where: {
      type: MandateType.MAIRE,
      isCurrent: true,
      politicianId: { in: [...chamberByPolitician.keys()] },
    },
    select: {
      id: true,
      politicianId: true,
      startDate: true,
      politician: { select: { slug: true } },
      localData: { select: { communeId: true, rneExternalId: true } },
    },
    orderBy: { startDate: "desc" },
  });
  console.log(`${localMandates.length} cumuls parlementaire + maire\n`);
  if (localMandates.length === 0) {
    await db.$disconnect();
    return;
  }

  // The register's own publication date, read from the resource it resolves to, and the mayor it
  // names for each commune. A mandate the register still confirms is not one a vote can close.
  const registerUrl = await resolveRneResourceUrl(RNE_MAIRES_FRAGMENTS);
  const stamp = registerUrl.match(/(\d{4})(\d{2})(\d{2})-\d+/);
  const registerDate = stamp ? new Date(`${stamp[1]}-${stamp[2]}-${stamp[3]}T00:00:00Z`) : null;
  console.log(`Registre : ${registerUrl}`);
  console.log(
    `  publié le ${registerDate ? registerDate.toISOString().slice(0, 10) : "date illisible"}\n`
  );

  const { data: csvText } = await new HTTPClient({ rateLimitMs: 0 }).getText(registerUrl);
  const registerRows = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    delimiter: ";",
    bom: true,
  }) as MaireRNECSV[];
  const registerCommunes = new Set(registerRows.map((row) => String(row["Code de la commune"])));

  const lastVotes = await db.vote.groupBy({
    by: ["politicianId"],
    where: { politicianId: { in: localMandates.map((m) => m.politicianId) } },
    _max: { votingDate: true },
  });
  const lastVoteByPolitician = new Map(
    lastVotes.map((row) => [row.politicianId, row._max.votingDate])
  );

  const toClose: { id: string; slug: string; endDate: Date; reason: string }[] = [];
  const untouched: string[] = [];

  for (const mandate of localMandates) {
    const commune = mandate.localData?.rneExternalId ?? mandate.localData?.communeId ?? null;
    const decision = decideCumul({
      localStartDate: mandate.startDate,
      lastParliamentaryVote: lastVoteByPolitician.get(mandate.politicianId) ?? null,
      localConfirmedAt: commune && registerCommunes.has(commune) ? registerDate : null,
    });
    const chamber = chamberByPolitician.get(mandate.politicianId);

    if (decision.action === "close-local") {
      toClose.push({
        id: mandate.id,
        slug: mandate.politician.slug,
        endDate: decision.endDate,
        reason: decision.reason,
      });
    } else {
      untouched.push(`${chamber} ${mandate.politician.slug} : ${decision.reason}`);
    }
  }

  console.log(`À fermer (${toClose.length}) :`);
  for (const entry of toClose) {
    console.log(`  ${entry.slug.padEnd(24)} fin au ${entry.endDate.toISOString().slice(0, 10)}`);
    console.log(`    ${entry.reason}`);
  }

  console.log(`\nLaissés intacts, faute de preuve (${untouched.length}) :`);
  for (const line of untouched) console.log(`  ${line}`);

  if (!apply) {
    console.log("\nLecture seule. Relancer avec --apply pour fermer.");
    await db.$disconnect();
    return;
  }

  let closed = 0;
  for (const entry of toClose) {
    // Re-checked at write time: another process may have closed it since the read.
    const result = await db.mandate.updateMany({
      where: { id: entry.id, isCurrent: true },
      data: { isCurrent: false, endDate: entry.endDate },
    });
    closed += result.count;
  }
  console.log(`\n${closed} mandats de maire fermés.`);

  await db.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
