// Fusion de mandats en doublon : un mandat est conservé, les autres sont absorbés.
// Chaque identifiant public absorbé continue de se résoudre via PublicIdRedirect
// (resolvePublicId suit la redirection). Tout passe dans une seule transaction.

import type { db as Db } from "@/lib/db";

/**
 * Seules références vers Mandate dans le schéma : les quatre extensions 1:1
 * (MandateLocal, MandateGovernment, MandateParliamentary, MandateEuropean, toutes en
 * onDelete Cascade), plus l'auto-référence MandateGovernment.predecessor. Aucune autre table
 * ne porte de mandateId. Les extensions de l'absorbé sont supprimées explicitement : leurs
 * données sont capturées dans l'AuditLog.
 */
export async function mergeMandates(
  db: typeof Db,
  keepMandateId: string,
  absorbedMandateIds: string[],
  reason: string
): Promise<{ redirects: number }> {
  const absorbedIds = [...new Set(absorbedMandateIds)];
  if (absorbedIds.length === 0) throw new Error("Aucun mandat à absorber");
  if (absorbedIds.includes(keepMandateId)) {
    throw new Error("Le mandat conservé figure parmi les mandats absorbés");
  }

  return db.$transaction(
    async (tx) => {
      const keep = await tx.mandate.findUnique({ where: { id: keepMandateId } });
      if (!keep) throw new Error(`Mandat conservé introuvable : ${keepMandateId}`);

      const absorbed = await tx.mandate.findMany({
        where: { id: { in: absorbedIds } },
        include: {
          localData: true,
          governmentData: true,
          parliamentaryData: true,
          europeanData: true,
        },
      });
      if (absorbed.length !== absorbedIds.length) {
        const found = new Set(absorbed.map((m) => m.id));
        const missing = absorbedIds.filter((id) => !found.has(id));
        throw new Error(`Mandat absorbé introuvable : ${missing.join(", ")}`);
      }

      for (const m of absorbed) {
        if (m.politicianId !== keep.politicianId) {
          throw new Error(`Le mandat ${m.id} appartient à une autre personne`);
        }
        if (m.type !== keep.type) {
          throw new Error(`Le mandat ${m.id} a un autre type (${m.type} au lieu de ${keep.type})`);
        }
        if (m.publicId && !keep.publicId) {
          throw new Error(
            `Le mandat conservé n'a pas d'identifiant public pour recevoir la redirection de ${m.publicId}`
          );
        }
      }

      const membershipIds = absorbed.flatMap((m) =>
        m.governmentData ? [m.governmentData.id] : []
      );
      if (membershipIds.length > 0) {
        const successor = await tx.mandateGovernment.findFirst({
          where: { predecessorId: { in: membershipIds } },
          select: { id: true, predecessorId: true },
        });
        if (successor) {
          throw new Error(
            `La fonction ${successor.predecessorId} est le prédécesseur de ${successor.id} : fusion refusée`
          );
        }
      }

      let redirects = 0;
      for (const m of absorbed) {
        if (m.publicId) {
          await tx.publicIdRedirect.create({
            data: {
              fromPublicId: m.publicId,
              toPublicId: keep.publicId!,
              entityType: "mandate",
              reason: "merged",
            },
          });
          redirects += 1;
        }
        await tx.auditLog.create({
          data: {
            action: "MERGE",
            entityType: "Mandate",
            entityId: m.id,
            changes: JSON.parse(
              JSON.stringify({
                keptMandateId: keep.id,
                keptPublicId: keep.publicId,
                absorbed: m,
                reason,
              })
            ),
          },
        });
        await tx.mandateLocal.deleteMany({ where: { mandateId: m.id } });
        await tx.mandateGovernment.deleteMany({ where: { mandateId: m.id } });
        await tx.mandateParliamentary.deleteMany({ where: { mandateId: m.id } });
        await tx.mandateEuropean.deleteMany({ where: { mandateId: m.id } });
        await tx.mandate.delete({ where: { id: m.id } });
      }
      return { redirects };
    },
    { timeout: 60_000 }
  );
}
