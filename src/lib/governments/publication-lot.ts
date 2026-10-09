// Lots de publication des fiches de membres de gouvernement (règle 3d).
// Chaque lot est identifié par un lotId et laisse des lignes AuditLog (entityType Politician) :
//   PUBLICATION_LOT_SNAPSHOT  { lotId, before: { publicationStatus, statusOverride }, after: null }
//   PUBLICATION_LOT_APPLIED   { lotId, after: { publicationStatus } }
//   PUBLICATION_LOT_ROLLBACK  { lotId, restored, statusOverride: true, reason }
// Le retour arrière ne restaure que les fiches que personne n'a touchées depuis le lot.

import type { db as Db } from "@/lib/db";
import type { PublicationStatus } from "@/generated/prisma";

export const LOT_SNAPSHOT = "PUBLICATION_LOT_SNAPSHOT";
export const LOT_APPLIED = "PUBLICATION_LOT_APPLIED";
export const LOT_ROLLBACK = "PUBLICATION_LOT_ROLLBACK";

type Snapshot = { publicationStatus: PublicationStatus; statusOverride: boolean };

function readJson<T>(value: unknown): T | null {
  return value && typeof value === "object" ? (value as T) : null;
}

/** Une ligne AuditLog par fiche, avant toute écriture. Refuse un lotId déjà utilisé. */
export async function snapshotStatuses(
  db: typeof Db,
  politicianIds: string[],
  lotId: string
): Promise<void> {
  const existing = await db.auditLog.count({
    where: { action: LOT_SNAPSHOT, changes: { path: ["lotId"], equals: lotId } },
  });
  if (existing > 0)
    throw new Error(`Le lot ${lotId} a déjà un instantané : choisir un autre identifiant.`);

  const rows = await db.politician.findMany({
    where: { id: { in: politicianIds } },
    select: { id: true, publicationStatus: true, statusOverride: true },
  });
  await db.auditLog.createMany({
    data: rows.map((r) => ({
      action: LOT_SNAPSHOT,
      entityType: "Politician",
      entityId: r.id,
      changes: {
        lotId,
        before: { publicationStatus: r.publicationStatus, statusOverride: r.statusOverride },
        after: null,
      },
    })),
  });
}

/** Note le statut posé par le lot, pour les fiches dont le statut a changé. */
export async function recordApplied(
  db: typeof Db,
  lotId: string,
  applied: { id: string; publicationStatus: PublicationStatus }[]
): Promise<void> {
  await db.auditLog.createMany({
    data: applied.map((a) => ({
      action: LOT_APPLIED,
      entityType: "Politician",
      entityId: a.id,
      changes: { lotId, after: { publicationStatus: a.publicationStatus } },
    })),
  });
}

export async function rollbackLot(
  db: typeof Db,
  lotId: string
): Promise<{ restored: string[]; skipped: { id: string; reason: string }[] }> {
  const lotRows = await db.auditLog.findMany({
    where: {
      action: { in: [LOT_SNAPSHOT, LOT_APPLIED] },
      entityType: "Politician",
      changes: { path: ["lotId"], equals: lotId },
    },
    select: { action: true, entityId: true, changes: true },
  });

  const before = new Map<string, Snapshot>();
  const after = new Map<string, PublicationStatus>();
  for (const r of lotRows) {
    const c = readJson<{
      before?: Snapshot;
      after?: { publicationStatus: PublicationStatus } | null;
    }>(r.changes);
    if (r.action === LOT_SNAPSHOT && c?.before) before.set(r.entityId, c.before);
    if (r.action === LOT_APPLIED && c?.after) after.set(r.entityId, c.after.publicationStatus);
  }
  if (before.size === 0) throw new Error(`Aucun instantané pour le lot ${lotId}.`);

  const restored: string[] = [];
  const skipped: { id: string; reason: string }[] = [];

  for (const [id, snap] of before) {
    const posed = after.get(id);
    if (!posed) {
      skipped.push({ id, reason: "le lot n'a pas modifié cette fiche" });
      continue;
    }
    const outcome = await db.$transaction(async (tx) => {
      const cur = await tx.politician.findUnique({
        where: { id },
        select: { publicationStatus: true, statusOverride: true },
      });
      if (!cur) return "fiche introuvable";
      if (cur.statusOverride) return "statusOverride posé depuis le lot";
      if (cur.publicationStatus !== posed) {
        return `statut modifié depuis le lot (${cur.publicationStatus} au lieu de ${posed})`;
      }
      await tx.politician.update({
        where: { id },
        data: { publicationStatus: snap.publicationStatus, statusOverride: true },
      });
      await tx.auditLog.create({
        data: {
          action: LOT_ROLLBACK,
          entityType: "Politician",
          entityId: id,
          changes: {
            lotId,
            from: posed,
            restored: snap.publicationStatus,
            statusOverride: true,
            reason:
              "Retour arrière du lot : statusOverride posé pour que la règle 3d ne republie pas la fiche",
          },
        },
      });
      return null;
    });
    if (outcome) skipped.push({ id, reason: outcome });
    else restored.push(id);
  }
  return { restored, skipped };
}

export type RevalidateDeps = {
  fetchImpl: typeof fetch;
  siteUrl: string;
  cronSecret: string;
  sleep: (ms: number) => Promise<void>;
  batchSize?: number;
  delayMs?: number;
};

async function post(deps: RevalidateDeps, body: unknown) {
  const res = await deps.fetchImpl(`${deps.siteUrl.replace(/\/$/, "")}/api/cron/revalidate`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${deps.cronSecret}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Revalidation refusée (${res.status}) pour ${JSON.stringify(body)}`);
}

/** Chemins par lots de 10 espacés, puis le seul tag « gouvernements ». Jamais de tag large. */
export async function revalidateProfilePaths(slugs: string[], deps: RevalidateDeps): Promise<void> {
  const size = Math.min(deps.batchSize ?? 10, 10);
  const delay = deps.delayMs ?? 30_000;
  for (let i = 0; i < slugs.length; i += size) {
    if (i > 0) await deps.sleep(delay);
    await post(deps, { paths: slugs.slice(i, i + size).map((s) => `/politiques/${s}`) });
  }
  await post(deps, { tags: ["gouvernements"] });
}
