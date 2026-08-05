import type { Prisma, PublicationStatus } from "@/generated/prisma";
import type { MeasureWithdrawal } from "@/lib/data/measures";

/**
 * What a moderator needs to know about a measure, derived from the measure and its
 * revisions alone.
 *
 * Four independent axes rather than one enum. "Empty, draft, reviewed, published,
 * depublished, withdrawn, inconsistent" are not seven mutually exclusive values: a
 * withdrawn measure can stay published, a published measure can carry a correction under
 * review, and inconsistency is not a stage but the presence of an anomaly. Flattening them
 * would repeat the mixed-sentence defect, where a structure poorer than reality states
 * something false without ever failing.
 *
 * Type-only imports on purpose: this module must stay loadable without DATABASE_URL, and
 * `@/lib/data/measures` imports the Prisma client as a value.
 */

/** The stage of the editorial cycle, as opposed to the raw column value. */
export type PublicationState = "EMPTY" | "DRAFT" | "REVIEWED" | "PUBLISHED" | "DEPUBLISHED";

/**
 * The anomaly vocabulary is the audit's vocabulary, deliberately: same strings as the rules
 * of `src/lib/measures/audit.ts`, so the queue and the command name the same defect the same
 * way. A test asserts every code below appears literally in that file.
 *
 * These eleven are the rules derivable from a measure and its revisions. The audit's other
 * rules cross other tables (candidacy, programme edition, search index, qualifications,
 * assessments); recomputing them here would duplicate the audit inside a page.
 */
export const MODERATION_ANOMALY_CODES = [
  "published_revision_foreign",
  "published_revision_unreviewed",
  "published_revision_unpublished",
  "published_revision_superseded",
  "published_revision_without_source",
  "multiple_published_revisions",
  "orphan_active_draft",
  "latest_revision_foreign",
  "latest_revision_discarded",
  "withdrawn_without_source",
  "withdrawal_source_without_date",
] as const;

export type ModerationAnomalyCode = (typeof MODERATION_ANOMALY_CODES)[number];

export type ModerationAnomaly = {
  code: ModerationAnomalyCode;
  /** The identifiers involved, so the moderator can act instead of only being warned. */
  detail: string;
};

export type ModerationRevisionRow = {
  id: string;
  reviewedAt: Date | null;
  publishedAt: Date | null;
  supersededAt: Date | null;
  discardedAt: Date | null;
  sourceCount: number;
};

export type ModerationMeasureRow = {
  id: string;
  publicationStatus: PublicationStatus;
  latestRevisionId: string | null;
  publishedRevisionId: string | null;
  withdrawnAt: Date | null;
  withdrawnSourceUrl: string | null;
  withdrawnSourceLabel: string | null;
  depublishedAt: Date | null;
  depublicationReason: string | null;
  revisions: ModerationRevisionRow[];
};

/**
 * Mirrors the shape arbitrated for withdrawal, for the same reason: the presence of the
 * object is the fact, and a missing reason must not hide the depublication. Only
 * depublishMeasure() writes these fields and it demands a reason, so a null reason can only
 * come from a direct database write.
 */
export type MeasureDepublication = { at: Date; reason: string | null };

export type ModerationState = {
  publication: PublicationState;
  /**
   * The raw column, carried through rather than folded into `publication`. The enum is
   * shared with affairs and holds ARCHIVED, EXCLUDED and REJECTED, which the measure
   * transitions never produce but a direct write can. Deriving without exposing it would
   * silently turn an EXCLUDED measure into a plain draft.
   */
  declaredStatus: PublicationStatus;
  publiclyVisible: boolean;
  /** Empty exactly when `publiclyVisible` is true. Carries the why. */
  visibilityBlockers: VisibilityBlocker[];
  withdrawal: MeasureWithdrawal | null;
  depublication: MeasureDepublication | null;
  /** The correction in flight, which the PUBLISHED stage would otherwise hide. */
  pendingDraft: { id: string; reviewed: boolean } | null;
  anomalies: ModerationAnomaly[];
};

/**
 * The one selection every moderation read uses, so the queue and the tests cannot drift on
 * what the derivation is fed. Kept next to the shape it produces rather than in the admin
 * route, because the derivation is the consumer.
 */
export const MODERATION_MEASURE_SELECT = {
  id: true,
  publicationStatus: true,
  latestRevisionId: true,
  publishedRevisionId: true,
  withdrawnAt: true,
  withdrawnSourceUrl: true,
  withdrawnSourceLabel: true,
  depublishedAt: true,
  depublicationReason: true,
  revisions: {
    select: {
      id: true,
      reviewedAt: true,
      publishedAt: true,
      supersededAt: true,
      discardedAt: true,
      _count: { select: { sources: true } },
    },
    orderBy: { validFrom: "asc" },
  },
} satisfies Prisma.MeasureSelect;

export type ModerationMeasureDbRow = Prisma.MeasureGetPayload<{
  select: typeof MODERATION_MEASURE_SELECT;
}>;

/** Flattens Prisma's `_count.sources` into the source count the derivation reads. */
export function toModerationMeasureRow(row: ModerationMeasureDbRow): ModerationMeasureRow {
  return {
    id: row.id,
    publicationStatus: row.publicationStatus,
    latestRevisionId: row.latestRevisionId,
    publishedRevisionId: row.publishedRevisionId,
    withdrawnAt: row.withdrawnAt,
    withdrawnSourceUrl: row.withdrawnSourceUrl,
    withdrawnSourceLabel: row.withdrawnSourceLabel,
    depublishedAt: row.depublishedAt,
    depublicationReason: row.depublicationReason,
    revisions: row.revisions.map((revision) => ({
      id: revision.id,
      reviewedAt: revision.reviewedAt,
      publishedAt: revision.publishedAt,
      supersededAt: revision.supersededAt,
      discardedAt: revision.discardedAt,
      sourceCount: revision._count.sources,
    })),
  };
}

function isActiveDraft(revision: ModerationRevisionRow): boolean {
  return revision.publishedAt === null && revision.discardedAt === null;
}

function findRevision(row: ModerationMeasureRow, id: string | null): ModerationRevisionRow | null {
  if (id === null) return null;
  return row.revisions.find((r) => r.id === id) ?? null;
}

/**
 * Every reason the public read would leave this measure out, one entry per unmet condition
 * of PUBLIC_MEASURE_WHERE in `src/lib/data/measures.ts`.
 *
 * Reasons rather than a boolean, because "published but invisible" is useless to a moderator
 * without the why. And they are NOT the anomaly list: an anomaly is data that should not
 * exist, a blocker is a condition that is not met. A depublished measure has a blocker and
 * no anomaly; a published revision carrying `discardedAt` has a blocker that the audit has
 * no rule for at all.
 */
export const VISIBILITY_BLOCKERS = [
  "status_not_published",
  "no_published_pointer",
  "pointer_not_found",
  "revision_unreviewed",
  "revision_never_published",
  "revision_superseded",
  "revision_discarded",
  "revision_without_source",
] as const;

export type VisibilityBlocker = (typeof VISIBILITY_BLOCKERS)[number];

/**
 * Echoes PUBLIC_MEASURE_WHERE condition by condition. That file is the authority on what the
 * public sees; this is a read-side echo of it, and the two are crossed on the same rows by
 * `__tests__/moderation-state.integration.test.ts`.
 *
 * `publiclyVisible` is then defined as "no blocker", so the flag and the explanation cannot
 * disagree: there is one list of conditions, not a boolean beside a list.
 */
function deriveVisibilityBlockers(
  row: ModerationMeasureRow,
  published: ModerationRevisionRow | null
): VisibilityBlocker[] {
  const blockers: VisibilityBlocker[] = [];

  if (row.publicationStatus !== "PUBLISHED") blockers.push("status_not_published");
  if (row.publishedRevisionId === null) {
    blockers.push("no_published_pointer");
    return blockers;
  }
  if (published === null) {
    blockers.push("pointer_not_found");
    return blockers;
  }

  if (published.reviewedAt === null) blockers.push("revision_unreviewed");
  if (published.publishedAt === null) blockers.push("revision_never_published");
  if (published.supersededAt !== null) blockers.push("revision_superseded");
  if (published.discardedAt !== null) blockers.push("revision_discarded");
  if (published.sourceCount === 0) blockers.push("revision_without_source");

  return blockers;
}

function derivePublication(
  row: ModerationMeasureRow,
  activeDrafts: ModerationRevisionRow[]
): PublicationState {
  // Declared published with a pointer: the stage is PUBLISHED even when the pointed
  // revision is broken. publiclyVisible carries the disagreement; collapsing the two would
  // lose one of the two facts.
  if (row.publicationStatus === "PUBLISHED" && row.publishedRevisionId !== null) {
    return "PUBLISHED";
  }
  // depublishedAt is the explicit trace, not a guess from "some revision was published
  // once": a republication clears it, so it means "currently depublished".
  if (row.depublishedAt !== null) return "DEPUBLISHED";
  if (activeDrafts.length === 0) return "EMPTY";

  const designated = activeDrafts.find((r) => r.id === row.latestRevisionId);
  if (designated) return designated.reviewedAt !== null ? "REVIEWED" : "DRAFT";

  // No pointer designates an active draft, which is orphan_active_draft. The stage still
  // has to be decided, and it must not depend on the order the rows came back in: "a
  // reviewed draft exists" is order-independent, "the last one in the array" is not.
  return activeDrafts.some((r) => r.reviewedAt !== null) ? "REVIEWED" : "DRAFT";
}

function collectAnomalies(
  row: ModerationMeasureRow,
  published: ModerationRevisionRow | null,
  activeDrafts: ModerationRevisionRow[]
): ModerationAnomaly[] {
  const anomalies: ModerationAnomaly[] = [];

  if (row.publishedRevisionId !== null && published === null) {
    anomalies.push({ code: "published_revision_foreign", detail: row.publishedRevisionId });
  }
  if (published !== null) {
    if (published.reviewedAt === null) {
      anomalies.push({ code: "published_revision_unreviewed", detail: published.id });
    }
    if (published.publishedAt === null) {
      anomalies.push({ code: "published_revision_unpublished", detail: published.id });
    }
    if (published.supersededAt !== null) {
      anomalies.push({ code: "published_revision_superseded", detail: published.id });
    }
    if (published.sourceCount === 0) {
      anomalies.push({ code: "published_revision_without_source", detail: published.id });
    }
  }

  const currentlyPublished = row.revisions.filter(
    (r) => r.publishedAt !== null && r.supersededAt === null
  );
  if (currentlyPublished.length > 1) {
    anomalies.push({
      code: "multiple_published_revisions",
      detail: currentlyPublished.map((r) => r.id).join(", "),
    });
  }

  const orphans = activeDrafts.filter((r) => r.id !== row.latestRevisionId);
  if (orphans.length > 0) {
    anomalies.push({
      code: "orphan_active_draft",
      detail: orphans.map((r) => r.id).join(", "),
    });
  }

  const latest = findRevision(row, row.latestRevisionId);
  if (row.latestRevisionId !== null && latest === null) {
    anomalies.push({ code: "latest_revision_foreign", detail: row.latestRevisionId });
  }
  if (latest?.discardedAt) {
    anomalies.push({ code: "latest_revision_discarded", detail: latest.id });
  }

  if (row.withdrawnAt !== null && (!row.withdrawnSourceUrl || !row.withdrawnSourceLabel)) {
    anomalies.push({ code: "withdrawn_without_source", detail: row.id });
  }
  if (row.withdrawnAt === null && (row.withdrawnSourceUrl || row.withdrawnSourceLabel)) {
    anomalies.push({ code: "withdrawal_source_without_date", detail: row.id });
  }

  return anomalies;
}

export function deriveModerationState(row: ModerationMeasureRow): ModerationState {
  const published = findRevision(row, row.publishedRevisionId);
  const activeDrafts = row.revisions.filter(isActiveDraft);

  const latest = findRevision(row, row.latestRevisionId);
  // A pending draft is a correction waiting ON TOP of a published text, so it only exists once
  // something is published. Without that condition, a plain unpublished draft was reported as
  // "a correction is in progress" beside the DRAFT stage, which says there are two versions
  // when there is one. Found by looking at the rendered queue, not by the unit tests, which
  // asserted the wrong semantics.
  const pendingDraft =
    row.publishedRevisionId !== null &&
    latest !== null &&
    latest.id !== row.publishedRevisionId &&
    isActiveDraft(latest)
      ? { id: latest.id, reviewed: latest.reviewedAt !== null }
      : null;

  const visibilityBlockers = deriveVisibilityBlockers(row, published);

  return {
    publication: derivePublication(row, activeDrafts),
    declaredStatus: row.publicationStatus,
    publiclyVisible: visibilityBlockers.length === 0,
    visibilityBlockers,
    withdrawal:
      row.withdrawnAt !== null
        ? {
            withdrawnAt: row.withdrawnAt,
            sourceUrl: row.withdrawnSourceUrl,
            sourceLabel: row.withdrawnSourceLabel,
          }
        : null,
    depublication:
      row.depublishedAt !== null
        ? { at: row.depublishedAt, reason: row.depublicationReason }
        : null,
    pendingDraft,
    anomalies: collectAnomalies(row, published, activeDrafts),
  };
}
