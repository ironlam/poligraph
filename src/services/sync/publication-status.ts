/**
 * Publication status assignment service.
 *
 * Assigns PUBLISHED / DRAFT / ARCHIVED / EXCLUDED status to politicians
 * based on prominence rules. See rules in config/prominence.ts STATUS_RULES.
 */

import { db } from "@/lib/db";
import { PublicationStatus } from "@/generated/prisma";
import { requestProfileRefresh } from "@/lib/politicians/profile-snapshot/request";
import { determineStatus, type PoliticianRow } from "./publication-status-rules";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PublicationStatusOptions {
  dryRun?: boolean;
  /** Restrict the pass to these politicians (publication lots). */
  politicianIds?: string[];
}

export interface PublicationStatusStats {
  totalPoliticians: number;
  skippedOverride: number;
  unchanged: number;
  changes: Record<string, number>;
  /** Every status change decided by this pass (applied unless dryRun). */
  transitions: { id: string; from: PublicationStatus; to: PublicationStatus }[];
}

// ---------------------------------------------------------------------------
// Main service
// ---------------------------------------------------------------------------

export async function assignPublicationStatus(
  options: PublicationStatusOptions = {}
): Promise<PublicationStatusStats> {
  const { dryRun = false, politicianIds } = options;

  const politicians = await db.politician.findMany({
    where: politicianIds ? { id: { in: politicianIds } } : undefined,
    select: {
      id: true,
      birthDate: true,
      deathDate: true,
      photoUrl: true,
      biography: true,
      publicationStatus: true,
      statusOverride: true,
      prominenceScore: true,
      mandates: {
        where: { isCurrent: true },
        select: { id: true },
        take: 1,
      },
      // Rule 3b needs to know whether we publish a judicial affair about this
      // person. Restricted to DIRECT, matching how the prominence affairs score
      // counts them: being merely mentioned is not a reason to publish a profile.
      affairs: {
        where: { publicationStatus: "PUBLISHED", involvement: "DIRECT" },
        select: { id: true },
        take: 1,
      },
      // A published presidential fiche is an explicit editorial decision, just like a
      // published direct affair. Require the identity fields enforced by the admin
      // publication action so an incomplete legacy row cannot publish a profile.
      candidacies: {
        where: {
          election: { type: "PRESIDENTIELLE" },
          status: { not: null },
          sourceUrl: { not: null },
          sourceLabel: { not: null },
          presidentialData: { is: { publicationStatus: PublicationStatus.PUBLISHED } },
        },
        select: { id: true },
        take: 1,
      },
    },
  });

  // Rule 3d: government functions whose start is proved by an official act. Separate
  // query because `mandates` above is already filtered on isCurrent.
  const verified = await db.mandate.findMany({
    where: {
      governmentData: { is: { startEvidence: "ACT" } },
      ...(politicianIds ? { politicianId: { in: politicianIds } } : {}),
    },
    select: { politicianId: true },
    distinct: ["politicianId"],
  });
  const verifiedIds = new Set(verified.map((m) => m.politicianId));

  const changes: Map<PublicationStatus, string[]> = new Map();
  let skippedOverride = 0;
  let unchanged = 0;
  const transitions: PublicationStatusStats["transitions"] = [];

  for (const p of politicians) {
    const row: PoliticianRow = {
      id: p.id,
      birthDate: p.birthDate,
      deathDate: p.deathDate,
      photoUrl: p.photoUrl,
      biography: p.biography,
      publicationStatus: p.publicationStatus,
      statusOverride: p.statusOverride,
      prominenceScore: p.prominenceScore,
      hasCurrentMandate: p.mandates.length > 0,
      hasPublishedDirectAffair: p.affairs.length > 0,
      hasPublishedPresidentialCandidacy: p.candidacies.length > 0,
      hasVerifiedGovernmentFunction: verifiedIds.has(p.id),
    };

    const targetStatus = determineStatus(row);

    if (targetStatus === null) {
      skippedOverride++;
      continue;
    }

    if (targetStatus === p.publicationStatus) {
      unchanged++;
      continue;
    }

    const ids = changes.get(targetStatus) ?? [];
    ids.push(p.id);
    changes.set(targetStatus, ids);
    transitions.push({ id: p.id, from: p.publicationStatus, to: targetStatus });
  }

  // Apply batch updates
  if (!dryRun) {
    for (const [status, ids] of changes) {
      await db.politician.updateMany({
        where: { id: { in: ids } },
        data: { publicationStatus: status },
      });
    }
    // Publications and depublications in one request, after every write: a profile that left
    // PUBLISHED loses its stored document, a new one gets built.
    const changedIds = [...changes.values()].flat();
    if (changedIds.length > 0) {
      await requestProfileRefresh({ politicianIds: changedIds }, "sync:publication-status");
    }
  }

  const changeStats: Record<string, number> = {};
  for (const [status, ids] of changes) {
    changeStats[status] = ids.length;
  }

  return {
    totalPoliticians: politicians.length,
    skippedOverride,
    unchanged,
    changes: changeStats,
    transitions,
  };
}
