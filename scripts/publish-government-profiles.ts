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
import {
  diffPrediction,
  recordApplied,
  revalidateProfilePaths,
  rollbackLot,
  snapshotStatuses,
  splitTransitions,
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

async function runRollback(lotId: string) {
  if (!flag("--confirm-production")) {
    console.error("--rollback exige --confirm-production. Rien n'a été écrit.");
    process.exitCode = 1;
    return;
  }
  const deps = revalidateDeps();
  const { restored, skipped, incomplete } = await rollbackLot(db, lotId);
  if (incomplete) {
    console.error(incomplete.message);
    console.error(`${incomplete.snapshotted} fiche(s) dans l'instantané :`);
    for (const r of incomplete.politicians) {
      console.error(`  ${r.id} : avant ${r.before}, actuel ${r.current ?? "introuvable"}`);
    }
    process.exitCode = 1;
    return;
  }
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
  const names = new Map(rows.map((r) => [r.id, r]));
  // Même calcul que l'application (candidature présidentielle comprise) : simulation sans écriture.
  const plan = await assignPublicationStatus({
    dryRun: true,
    politicianIds: rows.map((r) => r.id),
  });
  const { concerned, notConcerned } = splitTransitions(plan.transitions);
  const label = (id: string) => `${names.get(id)?.fullName ?? "?"} (${id})`;

  console.log(
    `Lot ${lotId} : ${concerned.length} publication(s) prévue(s) sur ${rows.length} candidate(s).`
  );
  for (const t of concerned) console.log(`  ${label(t.id)} : ${t.from} -> ${t.to}`);
  console.log(`\nNon concernés par ce lot : ${notConcerned.length} (jamais modifiés par ce lot).`);
  for (const t of notConcerned) console.log(`  ${label(t.id)} : ${t.from}, statut calculé ${t.to}`);
  if (!apply) {
    console.log("\nRapport seul. Appliquer avec --apply --confirm-production.");
    return;
  }

  const ids = concerned.map((t) => t.id);
  if (ids.length === 0) {
    console.log("Rien à publier.");
    return;
  }
  await snapshotStatuses(db, ids, lotId);
  await assignPublicationStatus({ politicianIds: ids });

  const after = await db.politician.findMany({
    where: { id: { in: ids } },
    select: { id: true, slug: true, publicationStatus: true },
  });
  const before = new Map(concerned.map((t) => [t.id, t.from]));
  const changed = after.filter((a) => a.publicationStatus !== before.get(a.id));
  await recordApplied(db, lotId, changed);
  console.log(`\nBascules appliquées : ${changed.length} sur ${ids.length} prévues.`);

  await revalidateProfilePaths(
    changed.map((c) => c.slug),
    deps!
  );
  console.log("Revalidation envoyée.");

  const diff = diffPrediction(
    ids,
    changed.map((c) => c.id)
  );
  if (!diff.ok) {
    console.error("ATTENTION : l'application ne correspond pas à la simulation.");
    for (const id of diff.missing) console.error(`  prévue mais non basculée : ${label(id)}`);
    for (const id of diff.unexpected) console.error(`  basculée sans être prévue : ${label(id)}`);
    process.exitCode = 1;
  }
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
