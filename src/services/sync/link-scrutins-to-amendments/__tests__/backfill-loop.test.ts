import { describe, it, expect } from "vitest";
import { evaluateLinkLoopStep } from "../backfill-loop";

describe("evaluateLinkLoopStep", () => {
  it("continues while links are still being created and under the iteration cap", () => {
    const decision = evaluateLinkLoopStep({
      linksCreatedThisIteration: 12,
      recentLinkableUnlinked: 40,
      iteration: 3,
      maxIterations: 50,
    });
    expect(decision).toEqual({ action: "continue" });
  });

  it("reports success once no new links are created and no linkable votes remain", () => {
    const decision = evaluateLinkLoopStep({
      linksCreatedThisIteration: 0,
      recentLinkableUnlinked: 0,
      iteration: 5,
      maxIterations: 50,
    });
    expect(decision.action).toBe("done");
    expect((decision as { reason: string }).reason).toMatch(/no new links/i);
  });

  it("errors (backlog stuck) when no new links are created but linkable votes remain", () => {
    const decision = evaluateLinkLoopStep({
      linksCreatedThisIteration: 0,
      recentLinkableUnlinked: 17,
      iteration: 5,
      maxIterations: 50,
    });
    expect(decision.action).toBe("error");
    expect((decision as { reason: string }).reason).toMatch(/stuck/i);
    expect((decision as { reason: string }).reason).toMatch(/17/);
  });

  it("errors (safety cap) once the iteration cap is reached, even if links are still being created", () => {
    const decision = evaluateLinkLoopStep({
      linksCreatedThisIteration: 5,
      recentLinkableUnlinked: 8,
      iteration: 50,
      maxIterations: 50,
    });
    expect(decision.action).toBe("error");
    expect((decision as { reason: string }).reason).toMatch(/maxIterations/);
  });
});
