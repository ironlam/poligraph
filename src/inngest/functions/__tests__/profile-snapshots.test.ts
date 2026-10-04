import { beforeEach, describe, expect, it, vi } from "vitest";

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
    orphansDeferred: 0,
    failures: 0,
    failedIds: [],
    ...overrides,
  };
}

describe("rattrapage des fiches politicien", () => {
  beforeEach(() => vi.clearAllMocks());

  it("parcourt les fiches publiques puis les documents orphelins, et compte les suppressions", async () => {
    const inputs: { list: unknown; invalidationsLeft: number; orphans?: boolean }[] = [];
    h.runReconcileBatch.mockImplementation(
      async (
        input: { invalidationsLeft: number; orphans?: boolean },
        deps: { listIds: unknown }
      ) => {
        inputs.push({
          list: deps.listIds,
          invalidationsLeft: input.invalidationsLeft,
          orphans: input.orphans,
        });
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
      {
        list: h.listPublicPoliticianIds,
        invalidationsLeft: PROFILE_INVALIDATION_CAP,
        orphans: false,
      },
      {
        list: h.listOrphanProfileSnapshotIds,
        invalidationsLeft: PROFILE_INVALIDATION_CAP - 3,
        orphans: true,
      },
    ]);
    expect(step.run.mock.calls.map((c) => c[0])).toEqual(["start", "batch-1", "orphans-1"]);
    expect(summary).toMatchObject({ batches: 2, processed: 12, updated: 3, removed: 2 });
    expect(summary).toMatchObject({ invalidated: 5 });
  });

  it("signale dans Sentry les orphelins laissés en place faute de budget", async () => {
    h.runReconcileBatch.mockImplementation(async (_input: unknown, deps: { listIds: unknown }) =>
      deps.listIds === h.listPublicPoliticianIds ? batch({}) : batch({ orphansDeferred: 4 })
    );
    const step = { run: vi.fn(async (_id: string, fn: () => unknown) => fn()) };

    const summary = await (h.handlers["reconcile-politician-profiles"] as Handler)({
      event: { data: { reason: "test" } },
      step,
    });

    expect(summary).toMatchObject({ orphansDeferred: 4, deferred: 0, failures: 0 });
    expect(h.captureMessage).toHaveBeenCalledExactlyOnceWith(
      "Rattrapage des fiches politicien incomplet",
      expect.objectContaining({ extra: expect.objectContaining({ orphansDeferred: 4 }) })
    );
  });
});
