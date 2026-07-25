import { db } from "@/lib/db";
import type { Prisma, SourceType } from "@/generated/prisma";

// Affaires v2, lot 1: attaching a source to an affair stays a direct write, since
// it is purely additive and never overwrites a judicial value. But it must be
// idempotent: replaying an import cannot duplicate a source row.
//
// Stable identity = (affairId, url), backed by a unique index. The previous
// judilibre code deduplicated on (affairId, sourceType), which silently dropped a
// second Cassation decision on the same affair.

export interface AffairSourceInput {
  affairId: string;
  url: string;
  title: string;
  publisher: string;
  publishedAt: Date;
  sourceType: SourceType;
  excerpt?: string | null;
  archivedUrl?: string | null;
}

/**
 * Adds a source unless the same (affairId, url) already exists.
 *
 * Returns whether a row was created. Uses upsert so two concurrent importer
 * passes cannot both insert: the unique index makes the loser a no-op update
 * rather than a P2002.
 */
export async function upsertAffairSource(
  input: AffairSourceInput
): Promise<{ created: boolean; id: string }> {
  const existing = await db.source.findUnique({
    where: { affairId_url: { affairId: input.affairId, url: input.url } },
    select: { id: true },
  });

  if (existing) return { created: false, id: existing.id };

  const data: Prisma.SourceUncheckedCreateInput = {
    affairId: input.affairId,
    url: input.url,
    title: input.title,
    publisher: input.publisher,
    publishedAt: input.publishedAt,
    sourceType: input.sourceType,
    excerpt: input.excerpt ?? null,
    archivedUrl: input.archivedUrl ?? null,
  };

  const row = await db.source.upsert({
    where: { affairId_url: { affairId: input.affairId, url: input.url } },
    create: data,
    // Concurrent insert lost the race: keep what is there, do not overwrite.
    update: {},
    select: { id: true },
  });

  return { created: true, id: row.id };
}
