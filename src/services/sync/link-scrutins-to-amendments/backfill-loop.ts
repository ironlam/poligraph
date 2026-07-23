export interface LinkLoopStepInput {
  linksCreatedThisIteration: number;
  recentLinkableUnlinked: number; // AMENDEMENT + dossier, still unlinked, after this iteration
  iteration: number; // 1-based
  maxIterations: number;
}

export type LinkLoopDecision =
  | { action: "continue" }
  | { action: "done"; reason: string }
  | { action: "error"; reason: string };

/**
 * Decide whether the backfill loop continues, finished cleanly, or must abort:
 * - links still being created and under the iteration cap -> continue
 * - no new links and no linkable votes left -> done (success)
 * - no new links but linkable votes remain -> error (backlog stuck: those
 *   candidates cannot be linked; needs investigation, not silent success)
 * - iteration cap reached -> error (safety limit; avoids an unbounded loop)
 */
export function evaluateLinkLoopStep(i: LinkLoopStepInput): LinkLoopDecision {
  if (i.iteration >= i.maxIterations) {
    return {
      action: "error",
      reason: `safety cap: reached maxIterations=${i.maxIterations} with ${i.recentLinkableUnlinked} linkable votes still unlinked`,
    };
  }
  if (i.linksCreatedThisIteration > 0) return { action: "continue" };
  if (i.recentLinkableUnlinked === 0) {
    return { action: "done", reason: "no new links and no linkable votes remain" };
  }
  return {
    action: "error",
    reason:
      `backlog stuck: 0 new links but ${i.recentLinkableUnlinked} linkable votes remain unlinked ` +
      `(if linkableRemaining is close to the initial count, raise --batch above the linkable-candidate count)`,
  };
}
