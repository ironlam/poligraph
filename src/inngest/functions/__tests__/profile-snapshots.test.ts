import { describe, expect, it, vi } from "vitest";

type Handler = (ctx: { event: unknown; step: unknown }) => Promise<unknown>;

const h = vi.hoisted(() => ({
  handlers: {} as Record<string, unknown>,
  runReconcileBatch: vi.fn(),
  listPublicPoliticianIds: vi.fn(),
  listOrphanProfileSnapshotIds: vi.fn(),
  captureMessage: vi.fn(),
}));

vi.mock("../../client", () => ({
  inngest: {
    createFunction: (config: { id: string }, _triggers: unknown, handler: unknown) => {
      h.handlers[config.id] = handler;
      return { handler };
    },
  },
}));
vi.mock("@sentry/nextjs", () => ({ captureMessage: h.captureMessage }));
vi.mock("@/lib/politicians/profile-snapshot/reconcile", () => ({
  MAX_FAILED_IDS: 20,
  runReconcileBatch: h.runReconcileBatch,
  listPublicPoliticianIds: h.listPublicPoliticianIds,
  listOrphanProfileSnapshotIds: h.listOrphanProfileSnapshotIds,
}));
vi.mock("@/lib/politicians/profile-snapshot/refresh", () => ({
  refreshPoliticianProfile: vi.fn(),
}));

import { PROFILE_INVALIDATION_CAP } from "@/lib/politicians/profile-snapshot/events";
import "../profile-snapshots";

function batch(overrides: Record<string, unknown>) {
  return {
    cursor: null,
    processed: 0,
    updated: 0,
    removed: 0,
    invalidated: 0,
    deferred: 0,
    failures: 0,
    failedIds: [],
    ...overrides,
  };
}

describe("rattrapage des fiches politicien", () => {
  it("parcourt les fiches publiques puis les documents orphelins, et compte les suppressions", async () => {
    const inputs: { list: unknown; invalidationsLeft: number }[] = [];
    h.runReconcileBatch.mockImplementation(
      async (input: { invalidationsLeft: number }, deps: { listIds: unknown }) => {
        inputs.push({ list: deps.listIds, invalidationsLeft: input.invalidationsLeft });
        return deps.listIds === h.listPublicPoliticianIds
          ? batch({ processed: 10, updated: 3, invalidated: 3 })
          : batch({ processed: 2, removed: 2, invalidated: 2 });
      }
    );
    const step = { run: vi.fn(async (_id: string, fn: () => unknown) => fn()) };

    const summary = await (h.handlers["reconcile-politician-profiles"] as Handler)({
      event: { data: { reason: "test" } },
      step,
    });

    expect(inputs).toEqual([
      { list: h.listPublicPoliticianIds, invalidationsLeft: PROFILE_INVALIDATION_CAP },
      { list: h.listOrphanProfileSnapshotIds, invalidationsLeft: PROFILE_INVALIDATION_CAP - 3 },
    ]);
    expect(step.run.mock.calls.map((c) => c[0])).toEqual(["start", "batch-1", "orphans-1"]);
    expect(summary).toMatchObject({ batches: 2, processed: 12, updated: 3, removed: 2 });
    expect(summary).toMatchObject({ invalidated: 5 });
  });
});
