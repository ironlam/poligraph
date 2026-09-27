/**
 * Republish the mayors the first full run held back as possible duplicates, and who are not.
 *
 * Phase 2 used to decide on the resolver's score alone. That score is built to screen a name
 * against the whole country, and it does not penalise a birth date that diverges: "Catherine
 * Hervieu", mayor, scored 1.00 against "Catherine Hervieu", deputy, born on another day.
 *
 * Measured on the 2 647 profiles the run of 2026-09-28 set to DRAFT: 1 536 have a birth date
 * known on both sides and DIFFERENT, 1 096 more have a different first name with no birth date
 * to compare. Not one has a matching birth date. They are namesakes, and holding them back
 * removes from the site mayors who were really elected.
 *
 * This applies the same second opinion the sync now applies, to the rows already written.
 * Only a profile this sync created is considered, and only one whose DRAFT status nobody has
 * touched since. Nothing is unpublished: the only write is DRAFT to PUBLISHED.
 *
 * Usage:
 *   NEXT_PUBLIC_SENTRY_ENABLED=false npx tsx --env-file=.env scripts/repair-rne-namesake-drafts.ts
 *   NEXT_PUBLIC_SENTRY_ENABLED=false npx tsx --env-file=.env scripts/repair-rne-namesake-drafts.ts --apply
 */

import { DataSource, Judgement, PublicationStatus } from "@/generated/prisma";

import { db } from "@/lib/db";
import { couldDuplicate } from "@/services/sync/rne-holder";

const BATCH = 200;

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");

  const drafts = await db.politician.findMany({
    where: {
      source: DataSource.RNE,
      publicationStatus: PublicationStatus.DRAFT,
      externalIds: { none: {} },
    },
    select: {
      id: true,
      slug: true,
      firstName: true,
      lastName: true,
      birthDate: true,
      mandates: {
        where: { type: "MAIRE", isCurrent: true },
        select: { localData: { select: { rneExternalId: true } } },
        take: 1,
      },
    },
  });
  console.log(`${drafts.length} fiches RNE en brouillon`);

  const inseeCodes = drafts
    .map((draft) => draft.mandates[0]?.localData?.rneExternalId)
    .filter((code): code is string => Boolean(code));

  const decisions = await db.identityDecision.findMany({
    where: {
      sourceType: DataSource.RNE,
      sourceId: { in: inseeCodes },
      judgement: Judgement.UNDECIDED,
    },
    orderBy: { decidedAt: "desc" },
    select: { sourceId: true, politicianId: true },
  });
  const candidateByInsee = new Map<string, string>();
  for (const decision of decisions) {
    if (!candidateByInsee.has(decision.sourceId)) {
      candidateByInsee.set(decision.sourceId, decision.politicianId);
    }
  }

  const candidates = await db.politician.findMany({
    where: { id: { in: [...new Set(candidateByInsee.values())] } },
    select: { id: true, firstName: true, lastName: true, birthDate: true },
  });
  const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));

  const homonymes: { id: string; slug: string; contre: string }[] = [];
  let doutes = 0;
  let sansDecision = 0;

  for (const draft of drafts) {
    const inseeCode = draft.mandates[0]?.localData?.rneExternalId;
    const candidate = inseeCode ? candidateById.get(candidateByInsee.get(inseeCode) ?? "") : null;
    if (!candidate) {
      // No decision to re-read: leave it alone rather than guess.
      sansDecision++;
      continue;
    }

    if (
      couldDuplicate(
        { firstName: draft.firstName, lastName: draft.lastName, birthDate: draft.birthDate },
        candidate
      )
    ) {
      doutes++;
      continue;
    }

    homonymes.push({
      id: draft.id,
      slug: draft.slug,
      contre: `${candidate.firstName} ${candidate.lastName}`,
    });
  }

  console.log(`  Homonymes à republier : ${homonymes.length}`);
  console.log(`  Doutes maintenus      : ${doutes}`);
  console.log(`  Sans décision lisible : ${sansDecision}`);
  for (const entry of homonymes.slice(0, 8)) {
    console.log(`    ${entry.slug} (homonyme de ${entry.contre})`);
  }

  if (!apply) {
    console.log("\nLecture seule. Relancer avec --apply pour republier.");
    await db.$disconnect();
    return;
  }

  let published = 0;
  for (let start = 0; start < homonymes.length; start += BATCH) {
    const chunk = homonymes.slice(start, start + BATCH);
    const result = await db.politician.updateMany({
      // Re-checked at write time: a human may have moved one of these since the read.
      where: {
        id: { in: chunk.map((entry) => entry.id) },
        publicationStatus: PublicationStatus.DRAFT,
      },
      data: { publicationStatus: PublicationStatus.PUBLISHED },
    });
    published += result.count;
    console.log(`  ${Math.min(start + BATCH, homonymes.length)}/${homonymes.length}`);
  }
  console.log(`\n${published} fiches republiées.`);

  await db.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
