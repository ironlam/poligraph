import { beforeEach, describe, expect, it, vi } from "vitest";

type Handler = (ctx: { step: unknown }) => Promise<unknown>;

const h = vi.hoisted(() => ({ handler: undefined as unknown }));

vi.mock("../../client", () => ({
  inngest: {
    createFunction: (_config: unknown, _triggers: unknown, handler: unknown) => {
      h.handler = handler;
      return { handler };
    },
  },
}));
// The daily steps import their services lazily inside `step.run`, which the fake step below
// never calls; these top-level imports are the only ones that would reach a database.
vi.mock("@/lib/sync/sync-metadata", () => ({ syncMetadata: {} }));
vi.mock("@/lib/cache", () => ({ revalidateTags: vi.fn() }));
vi.mock("@/lib/monitoring/amendment-link-freshness", () => ({ isIngestionAnomaly: vi.fn() }));
vi.mock("@/lib/monitoring/amendment-link-query", () => ({ linkableUnlinkedVoteWhere: {} }));
vi.mock("../../vote-cache", () => ({ runVoteSyncWithCacheInvalidation: vi.fn() }));

import { PROFILE_RECONCILE_EVENT } from "@/lib/politicians/profile-snapshot/events";
import "../sync-daily";

async function runDaily() {
  const step = {
    run: vi.fn(async () => ({ success: true })),
    sendEvent: vi.fn(async () => undefined),
  };
  await (h.handler as Handler)({ step });
  return step;
}

describe("sync-daily : rattrapage des fiches", () => {
  beforeEach(() => vi.unstubAllEnvs());

  it("n'envoie pas le rattrapage sans l'interrupteur", async () => {
    const step = await runDaily();
    expect(step.run).toHaveBeenCalled();
    expect(step.sendEvent).not.toHaveBeenCalled();
  });

  it("n'envoie pas le rattrapage si l'interrupteur vaut autre chose que \"true\"", async () => {
    vi.stubEnv("PROFILE_SNAPSHOT_AUTO_RECONCILE", "yes");
    const step = await runDaily();
    expect(step.sendEvent).not.toHaveBeenCalled();
  });

  it('envoie le rattrapage après les étapes quand l\'interrupteur vaut "true"', async () => {
    vi.stubEnv("PROFILE_SNAPSHOT_AUTO_RECONCILE", "true");
    const step = await runDaily();
    expect(step.sendEvent).toHaveBeenCalledExactlyOnceWith("profile-reconcile", {
      name: PROFILE_RECONCILE_EVENT,
      data: { reason: "sync-daily" },
    });
    expect(step.sendEvent.mock.invocationCallOrder[0]).toBeGreaterThan(
      Math.max(...step.run.mock.invocationCallOrder)
    );
  });
});
