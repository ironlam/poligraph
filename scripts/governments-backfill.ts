/**
 * Backfill one-shot : crée les 48 gouvernements de la Ve République et rattache les
 * MandateGovernment existants. Ce script est supprimé dans la PR qui suit son exécution en
 * production.
 *
 * `.env` pointe en production : le mode par défaut est un rapport, sans écriture.
 * Écrire exige les deux drapeaux, `--apply --confirm-production`.
 *
 * Écrit uniquement des lignes Government et le rattachement MandateGovernment (governmentId,
 * startEvidence, endEvidence). Ne touche ni Mandate, ni Mandate.sourceUrl.
 *
 * Usage :
 *   npx tsx --env-file=.env scripts/governments-backfill.ts                               # rapport
 *   npx tsx --env-file=.env scripts/governments-backfill.ts --apply --confirm-production
 */
import { db } from "@/lib/db";
import { applyBackfill, planBackfill, type BackfillRow } from "@/lib/governments/backfill";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const confirmed = args.includes("--confirm-production");

async function main() {
  if (apply && !confirmed) {
    console.error("--apply exige --confirm-production. Rien n'a été écrit.");
    process.exitCode = 1;
    return;
  }

  const memberships = await db.mandateGovernment.findMany({
    select: {
      id: true,
      mandateId: true,
      governmentName: true,
      mandate: { select: { politicianId: true, type: true, startDate: true, endDate: true } },
    },
  });
  const rows: BackfillRow[] = memberships.map((m) => ({
    membershipId: m.id,
    mandateId: m.mandateId,
    politicianId: m.mandate.politicianId,
    governmentName: m.governmentName,
    type: m.mandate.type,
    startDate: m.mandate.startDate,
    endDate: m.mandate.endDate,
  }));

  const plan = planBackfill(rows);

  console.log(`=== ${plan.governments.length} gouvernement(s) à créer ou vérifier ===`);
  for (const g of plan.governments) {
    const r = g.report;
    console.log(
      `${String(g.sequence).padStart(2)} ${g.slug.padEnd(18)} fonctions ${String(r.functions).padStart(3)}` +
        ` | personnes ${String(r.persons).padStart(3)} | sans fin ${String(r.withoutEnd).padStart(3)}` +
        ` | jours d'entrée ${String(r.entryDays).padStart(2)} | jours de sortie ${String(r.exitDays).padStart(2)}` +
        ` | formé ${g.formedAt} | fin ${g.endedAt ?? "-"}`
    );
  }

  console.log(`\n=== Non résolus : ${plan.unresolved.length} ===`);
  for (const u of plan.unresolved) {
    console.log(
      `  ${u.kind.padEnd(34)} ${u.slug ?? "-"} | ${u.label} | ${u.membershipIds.length} fonction(s)`
    );
  }

  if (!apply) {
    console.log("\nMode rapport. Relancer avec --apply --confirm-production pour écrire.");
    return;
  }

  const result = await applyBackfill(plan, db);
  console.log(
    `\nÉcrit : gouvernements ${result.governments.created} créé(s), ${result.governments.updated} modifié(s), ` +
      `${result.governments.unchanged} inchangé(s) ; fonctions ${result.memberships.updated} modifiée(s), ` +
      `${result.memberships.unchanged} inchangée(s).`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
