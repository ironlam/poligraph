/**
 * Lot de publication des fiches de membres de gouvernement (règle 3d, spec §10.2 et §10.3).
 *
 * `.env` pointe en production : le mode par défaut est un rapport, sans écriture.
 *
 * Usage :
 *   npx tsx --env-file=.env scripts/publish-government-profiles.ts --lot <id>
 *   npx tsx --env-file=.env scripts/publish-government-profiles.ts --lot <id> --apply --confirm-production
 *   npx tsx --env-file=.env scripts/publish-government-profiles.ts --rollback <id> --confirm-production
 *
 * Env pour --apply et --rollback : SITE_URL (ou NEXT_PUBLIC_SITE_URL), CRON_SECRET.
 * Revalidation : chemins /politiques/<slug> par lots de 10 espacés de 30 s, puis le tag
 * « gouvernements ». Aucune purge de tag large.
 */
import { db } from "@/lib/db";
import { assignPublicationStatus } from "@/services/sync/publication-status";
import { determineStatus } from "@/services/sync/publication-status-rules";
import {
  recordApplied,
  revalidateProfilePaths,
  rollbackLot,
  snapshotStatuses,
  type RevalidateDeps,
} from "@/lib/governments/publication-lot";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const value = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

function revalidateDeps(): RevalidateDeps {
  const siteUrl = process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL;
  const cronSecret = process.env.CRON_SECRET;
  if (!siteUrl || !cronSecret) {
    throw new Error(
      "SITE_URL (ou NEXT_PUBLIC_SITE_URL) et CRON_SECRET sont requis. Rien n'a été écrit."
    );
  }
  return {
    fetchImpl: fetch,
    siteUrl,
    cronSecret,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  };
}

async function candidates() {
  const rows = await db.politician.findMany({
    where: {
      statusOverride: false,
      publicationStatus: { not: "PUBLISHED" },
      mandates: { some: { governmentData: { is: { startEvidence: "ACT" } } } },
    },
    select: { id: true, slug: true, fullName: true, publicationStatus: true },
    orderBy: { fullName: "asc" },
  });
  return rows;
}

async function computedStatus(id: string) {
  const p = await db.politician.findUniqueOrThrow({
    where: { id },
    select: {
      id: true,
      birthDate: true,
      deathDate: true,
      photoUrl: true,
      biography: true,
      publicationStatus: true,
      statusOverride: true,
      prominenceScore: true,
      mandates: { where: { isCurrent: true }, select: { id: true }, take: 1 },
      affairs: {
        where: { publicationStatus: "PUBLISHED", involvement: "DIRECT" },
        select: { id: true },
        take: 1,
      },
    },
  });
  // Les lignes du lot ont toutes une fonction ACT. Le candidat présidentiel n'est pas relu ici :
  // le calcul exact est celui d'assignPublicationStatus à l'application.
  return determineStatus({
    ...p,
    hasCurrentMandate: p.mandates.length > 0,
    hasPublishedDirectAffair: p.affairs.length > 0,
    hasPublishedPresidentialCandidacy: false,
    hasVerifiedGovernmentFunction: true,
  });
}

async function runRollback(lotId: string) {
  if (!flag("--confirm-production")) {
    console.error("--rollback exige --confirm-production. Rien n'a été écrit.");
    process.exitCode = 1;
    return;
  }
  const deps = revalidateDeps();
  const { restored, skipped } = await rollbackLot(db, lotId);
  console.log(`Restaurées : ${restored.length}. Ignorées : ${skipped.length}.`);
  for (const s of skipped) console.log(`  ignorée ${s.id} : ${s.reason}`);
  if (restored.length > 0) {
    const rows = await db.politician.findMany({
      where: { id: { in: restored } },
      select: { slug: true },
    });
    await revalidateProfilePaths(
      rows.map((r) => r.slug),
      deps
    );
    console.log("Revalidation envoyée.");
  }
}

async function runLot(lotId: string) {
  const apply = flag("--apply");
  if (apply && !flag("--confirm-production")) {
    console.error("--apply exige --confirm-production. Rien n'a été écrit.");
    process.exitCode = 1;
    return;
  }
  const deps = apply ? revalidateDeps() : null;

  const rows = await candidates();
  console.log(`Lot ${lotId} : ${rows.length} fiche(s) candidate(s).`);
  for (const r of rows) {
    const next = await computedStatus(r.id);
    console.log(
      `  ${r.fullName} (${r.id}) : ${r.publicationStatus} -> ${next ?? "inchangé (statusOverride)"}`
    );
  }
  if (!apply) {
    console.log("\nRapport seul. Appliquer avec --apply --confirm-production.");
    return;
  }

  const ids = rows.map((r) => r.id);
  await snapshotStatuses(db, ids, lotId);
  await assignPublicationStatus({ politicianIds: ids });

  const after = await db.politician.findMany({
    where: { id: { in: ids } },
    select: { id: true, slug: true, publicationStatus: true },
  });
  const before = new Map(rows.map((r) => [r.id, r.publicationStatus]));
  const changed = after.filter((a) => a.publicationStatus !== before.get(a.id));
  await recordApplied(db, lotId, changed);
  console.log(`\nBascules appliquées : ${changed.length} sur ${rows.length}.`);

  await revalidateProfilePaths(
    changed.map((c) => c.slug),
    deps!
  );
  console.log("Revalidation envoyée.");
}

async function main() {
  const rollback = value("--rollback");
  if (rollback) return runRollback(rollback);
  const lotId = value("--lot");
  if (!lotId) {
    console.error("--lot <id> est requis (ou --rollback <id>).");
    process.exitCode = 1;
    return;
  }
  return runLot(lotId);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
