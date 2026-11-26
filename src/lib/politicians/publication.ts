import { db } from "@/lib/db";
import type { PublicationStatus } from "@/generated/prisma";
import type { RequestMeta } from "@/lib/security";
import { PUBLISHED_STATUS } from "@/lib/affairs/publish-guard";
import { lockMeasureCandidacy } from "@/lib/measures/lock";
import { syncPresidentialSearchDocumentsForCandidacy } from "@/lib/presidentielle/search-sync";

/** The four editorial gestures on a profile. REJECTED is an affair status, never a profile's. */
export const PROFILE_PUBLICATION_ACTIONS = ["publish", "draft", "archive", "exclude"] as const;
export type ProfilePublicationAction = (typeof PROFILE_PUBLICATION_ACTIONS)[number];

const TARGET: Record<ProfilePublicationAction, PublicationStatus> = {
  publish: "PUBLISHED",
  draft: "DRAFT",
  archive: "ARCHIVED",
  exclude: "EXCLUDED",
};

export type ChangePublicationResult =
  | {
      kind: "changed";
      politician: { id: string; slug: string; publicationStatus: PublicationStatus };
      /** Elections whose candidacy caches read this profile's visibility. */
      presidentialElectionIds: string[];
    }
  | { kind: "not-found" }
  | { kind: "unchanged"; publicationStatus: PublicationStatus }
  /** Publishing needs something a reader can check: a sourced mandate or an external id. */
  | { kind: "no-source" }
  /** A published affair would be left pointing at a profile the site no longer lists. */
  | { kind: "has-published-affair"; count: number };

/**
 * Changes a profile's publication status, as an explicit editorial decision.
 *
 * Two refusals. A profile is not published on nothing: it needs at least one mandate with a
 * source URL or one external identifier. And a profile is not taken off the site while one of
 * its affairs is published: the affair page would link to a profile the directory excludes.
 * The affairs are unpublished first, through their own circuit.
 *
 * `statusOverride` is set in every case. `determineStatus` reassigns the status of any profile
 * without it, so a decision taken here would be undone by the next pass.
 *
 * The status, the presidential search documents that depend on it and the audit row are written
 * in one transaction, under a lock on the profile. The profile document and the caches are the
 * caller's job, after commit.
 */
export async function changeProfilePublication(
  politicianId: string,
  action: ProfilePublicationAction,
  meta: RequestMeta
): Promise<ChangePublicationResult> {
  const target = TARGET[action];

  return db.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<
      Array<{ id: string; slug: string; publicationStatus: PublicationStatus }>
    >`
      SELECT id, slug, "publicationStatus"::text AS "publicationStatus"
      FROM "Politician" WHERE id = ${politicianId} FOR UPDATE
    `;
    const current = locked[0];
    if (!current) return { kind: "not-found" };
    if (current.publicationStatus === target) {
      return { kind: "unchanged", publicationStatus: target };
    }

    if (target === PUBLISHED_STATUS) {
      const [sourcedMandates, externalIds] = await Promise.all([
        tx.mandate.count({ where: { politicianId, sourceUrl: { not: null } } }),
        tx.externalId.count({ where: { politicianId } }),
      ]);
      if (sourcedMandates + externalIds === 0) return { kind: "no-source" };
    } else if (current.publicationStatus === PUBLISHED_STATUS) {
      const count = await tx.affair.count({
        where: { politicianId, publicationStatus: PUBLISHED_STATUS },
      });
      if (count > 0) return { kind: "has-published-affair", count };
    }

    // Unbounded by design (see ALLOWED_UNBOUNDED in candidacy-read-bounds.test.ts): every
    // presidential candidacy of this politician must be locked before the mutation, and a take
    // would leave some unlocked.
    const candidacies = await tx.candidacy.findMany({
      where: { politicianId, election: { type: "PRESIDENTIELLE" } },
      select: { id: true, electionId: true },
      orderBy: { id: "asc" },
    });
    for (const candidacy of candidacies) {
      await lockMeasureCandidacy(tx, candidacy.id);
    }

    const politician = await tx.politician.update({
      where: { id: politicianId },
      data: { publicationStatus: target, statusOverride: true },
      select: { id: true, slug: true, publicationStatus: true },
    });

    for (const candidacy of candidacies) {
      // A publication loss closes the candidate and measure search documents.
      await syncPresidentialSearchDocumentsForCandidacy(tx, candidacy.id);
    }

    await tx.auditLog.create({
      data: {
        action: "UPDATE",
        entityType: "Politician",
        entityId: politicianId,
        changes: {
          publicationStatus: { from: current.publicationStatus, to: target },
          statusOverride: true,
          gesture: action,
        },
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
      },
    });

    return {
      kind: "changed",
      politician,
      presidentialElectionIds: [...new Set(candidacies.map((c) => c.electionId))],
    };
  });
}
