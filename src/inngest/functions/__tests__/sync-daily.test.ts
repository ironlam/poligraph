import { describe, expect, it, vi } from "vitest";

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
const embeddings = vi.hoisted(() => ({ indexAllOfType: vi.fn(async () => ({})) }));
vi.mock("@/services/embeddings", () => embeddings);

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
  it("envoie le rattrapage après les étapes", async () => {
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

describe("sync-daily : embeddings des affaires", () => {
  it("réindexe chaque jour les affaires dont l'embedding est périmé", async () => {
    const step = {
      // Only this step's callback runs: the others would reach real services.
      run: vi.fn(async (name: string, fn: () => Promise<unknown>) =>
        name === "embeddings-affairs" ? fn() : { success: true }
      ),
      sendEvent: vi.fn(async () => undefined),
    };
    await (h.handler as Handler)({ step });

    expect(step.run.mock.calls.map((c) => c[0])).toContain("embeddings-affairs");
    expect(embeddings.indexAllOfType).toHaveBeenCalledExactlyOnceWith("AFFAIR", {
      deltaOnly: true,
    });
  });
});
