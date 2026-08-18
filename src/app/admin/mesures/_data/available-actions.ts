import type { ModerationAnomalyCode, ModerationState } from "@/lib/measures/moderation-state";

/**
 * Which editorial actions actually apply to a measure, derived from its state.
 *
 * Offering an action whose preconditions the transition will refuse teaches the reviewer that the
 * interface lies, and it costs a round trip to find out. So the panel shows what is possible, and
 * the transitions stay the authority: this derivation never relaxes a precondition, it only avoids
 * proposing what would be refused.
 */

export type AvailableAction =
  | { kind: "review"; revisionId: string }
  | { kind: "reject"; revisionId: string }
  | { kind: "publish"; revisionId: string; isFirstPublication: boolean }
  | { kind: "draft"; preservesEvidenceFromRevisionId?: string }
  | { kind: "depublish" }
  | { kind: "withdraw" };

/**
 * Anomalies that make the pointers themselves untrustworthy.
 *
 * With two published revisions, or a pointer designating a revision of another measure, there is no
 * safe answer to "which revision would this act on". The panel then shows the anomalies and no
 * action at all: a wrong guess here writes to the wrong revision.
 */
const AMBIGUOUS_POINTER_ANOMALIES: ModerationAnomalyCode[] = [
  "published_revision_foreign",
  "latest_revision_foreign",
  "multiple_published_revisions",
];

export function hasAmbiguousPointers(state: ModerationState): boolean {
  return state.anomalies.some((anomaly) => AMBIGUOUS_POINTER_ANOMALIES.includes(anomaly.code));
}

export function availableActions(input: {
  state: ModerationState;
  publishedRevisionId: string | null;
}): AvailableAction[] {
  const { state, publishedRevisionId } = input;

  if (hasAmbiguousPointers(state)) return [];

  const actions: AvailableAction[] = [];
  const isPublished = state.publication === "PUBLISHED";
  const isDepublished = state.publication === "DEPUBLISHED";

  // The active draft, whether it is the first one or a correction. Its own state decides between
  // reviewing and publishing it: the two cases differ by wording on screen, not by logic.
  if (state.activeDraft !== null) {
    if (state.activeDraft.reviewed) {
      actions.push({
        kind: "publish",
        revisionId: state.activeDraft.id,
        isFirstPublication: publishedRevisionId === null,
      });
    } else {
      actions.push({ kind: "review", revisionId: state.activeDraft.id });
    }
    actions.push({ kind: "reject", revisionId: state.activeDraft.id });
    actions.push({ kind: "draft", preservesEvidenceFromRevisionId: state.activeDraft.id });
  }

  // A depublished measure can go back online on the revision it had, which is a different act from
  // publishing a correction: the reviewer needs both offered, named differently.
  if (isDepublished && publishedRevisionId !== null) {
    actions.push({
      kind: "publish",
      revisionId: publishedRevisionId,
      isFirstPublication: false,
    });
  }

  // A new revision is only proposed when no draft is in flight: drafting discards the previous
  // active draft, so offering it beside one would offer to destroy it silently.
  //
  // Offered on an EMPTY measure too, and that matters: a measure whose only draft was discarded
  // would otherwise be a dead end with no action at all.
  if (state.activeDraft === null) {
    actions.push({ kind: "draft" });
  }

  if (isPublished) {
    actions.push({ kind: "depublish" });
    // A withdrawal is the candidate's act on a proposal the public can see. Recording one on a
    // measure the public never saw would state something about a text we never published.
    //
    // Deliberately still offered while a correction is in flight: a candidate can drop a proposal
    // at any moment, and the fact does not wait for our internal draft state. Hiding it would force
    // a reviewer to discard a colleague's correction before recording something that happened.
    if (state.withdrawal === null) actions.push({ kind: "withdraw" });
  }

  return actions;
}
