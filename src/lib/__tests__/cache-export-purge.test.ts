import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const dangerouslyDeleteByTag = vi.fn().mockResolvedValue(undefined);
const captureException = vi.fn();
const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
let afterThrows = false;
const scheduled: Array<() => Promise<void>> = [];

vi.mock("@vercel/functions", () => ({
  dangerouslyDeleteByTag: (...args: unknown[]) => dangerouslyDeleteByTag(...args),
}));

vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
}));

vi.mock("next/server", () => ({
  after: (callback: () => Promise<void>) => {
    // Next throws when `after()` is called outside a request context.
    if (afterThrows) throw new Error("`after()` was called outside a request scope");
    scheduled.push(callback);
  },
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: (...args: unknown[]) => captureException(...args),
}));

import { invalidateEntity, revalidateAll, revalidateTags } from "@/lib/cache";

/** Run what `after()` collected, the way the platform would after the response. */
async function flushAfter() {
  const callbacks = scheduled.splice(0);
  for (const callback of callbacks) await callback();
}

describe("purge des exports depuis invalidateEntity, revalidateAll et revalidateTags", () => {
  beforeEach(() => {
    vi.stubEnv("VERCEL", "1");
    dangerouslyDeleteByTag.mockClear();
    captureException.mockClear();
    consoleLog.mockClear();
    scheduled.length = 0;
    afterThrows = false;
  });
  afterEach(() => vi.unstubAllEnvs());

  it("hard-deletes the affairs export when an affair is written", async () => {
    invalidateEntity("affair", "une-affaire");
    await flushAfter();
    // No options: the default `revalidationDeadlineSeconds` is 0, immediate delete.
    // Passing 10 here would serve the stale (possibly depublished) content for 10s.
    expect(dangerouslyDeleteByTag).toHaveBeenCalledWith("export:affairs");
  });

  it("emits a positive trace when a purge succeeds, since a silent no-op purge and a real one both resolve without error", async () => {
    invalidateEntity("affair", "une-affaire");
    await flushAfter();
    expect(consoleLog).toHaveBeenCalledWith(
      expect.stringContaining("purge du tag export:affairs demandée")
    );
  });

  it.each([
    ["politician", "export:politicians"],
    ["factcheck", "export:factchecks"],
    ["vote", "export:votes"],
  ] as const)("hard-deletes %s exports", async (type, tag) => {
    invalidateEntity(type);
    await flushAfter();
    expect(dangerouslyDeleteByTag).toHaveBeenCalledWith(tag);
  });

  it("purges nothing for an entity that has no CSV export", async () => {
    invalidateEntity("dossier");
    invalidateEntity("stats");
    await flushAfter();
    expect(dangerouslyDeleteByTag).not.toHaveBeenCalled();
  });

  it("purges the three party-bearing exports when a party is written", async () => {
    // The affaires and factchecks exports serialize the politician's currentParty, and the
    // affaires one also serializes partyAtTime. Purging export:parties alone would leave a
    // renamed party visible in two public CSV files for the whole tier.
    invalidateEntity("party", "un-parti");
    await flushAfter();
    const purged = dangerouslyDeleteByTag.mock.calls.map((call) => call[0]).sort();
    expect(purged).toEqual(["export:affairs", "export:factchecks", "export:politicians"]);
  });

  it("purges the affaires and factchecks exports when a politician changes party", async () => {
    invalidateEntity("politician", "un-politique");
    await flushAfter();
    const purged = dangerouslyDeleteByTag.mock.calls.map((call) => call[0]).sort();
    expect(purged).toEqual(["export:affairs", "export:factchecks", "export:politicians"]);
  });

  it("purges the politiques export when an affair is written, for its affairs count", async () => {
    invalidateEntity("affair", "une-affaire");
    await flushAfter();
    const purged = dangerouslyDeleteByTag.mock.calls.map((call) => call[0]).sort();
    expect(purged).toEqual(["export:affairs", "export:politicians"]);
  });

  it("leaves the votes export alone, it carries no politician and no party", async () => {
    invalidateEntity("vote");
    await flushAfter();
    expect(dangerouslyDeleteByTag.mock.calls.map((call) => call[0])).toEqual(["export:votes"]);
  });

  it("does not throw when `after()` has no request scope (script, sync job)", () => {
    afterThrows = true;
    expect(() => invalidateEntity("affair", "une-affaire")).not.toThrow();
  });

  it("keeps the mutation alive but reports loudly when the purge fails", async () => {
    dangerouslyDeleteByTag.mockRejectedValueOnce(new Error("edge indisponible"));
    invalidateEntity("affair", "une-affaire");
    await expect(flushAfter()).resolves.toBeUndefined();
    expect(captureException).toHaveBeenCalled();
  });

  it("purges nothing outside Vercel, so local work does not hit the edge", async () => {
    vi.stubEnv("VERCEL", "");
    invalidateEntity("affair", "une-affaire");
    await flushAfter();
    expect(dangerouslyDeleteByTag).not.toHaveBeenCalled();
  });

  it("hard-deletes every export at once after a full sync", async () => {
    revalidateAll();
    await flushAfter();
    expect(dangerouslyDeleteByTag).toHaveBeenCalledWith("exports");
  });

  it("purges the rollup tag once, not once per tag in ALL_TAGS", async () => {
    revalidateAll();
    await flushAfter();
    expect(dangerouslyDeleteByTag).toHaveBeenCalledTimes(1);
  });

  it("hard-deletes the votes export on the tag the daily sync actually posts", async () => {
    revalidateTags(["votes"]);
    await flushAfter();
    expect(dangerouslyDeleteByTag).toHaveBeenCalledWith("export:votes");
  });

  it("purges every export the second sync batch touches, and only those", async () => {
    revalidateTags(["dossiers", "stats", "politicians", "factchecks"]);
    await flushAfter();
    const purged = dangerouslyDeleteByTag.mock.calls.map((call) => call[0]).sort();
    expect(purged).toEqual(["export:affairs", "export:factchecks", "export:politicians"]);
  });

  it("purges an export once when several posted tags share it", async () => {
    // "politicians" and "factchecks" both depend on export:politicians and export:factchecks.
    revalidateTags(["politicians", "factchecks"]);
    await flushAfter();
    const purged = dangerouslyDeleteByTag.mock.calls.map((call) => call[0]).sort();
    expect(purged).toEqual(["export:affairs", "export:factchecks", "export:politicians"]);
  });

  it("purges nothing for a tag with no export behind it", async () => {
    revalidateTags(["elections", "dossiers", "stats"]);
    await flushAfter();
    expect(dangerouslyDeleteByTag).not.toHaveBeenCalled();
  });

  // The two lookup tables are keyed on different vocabularies (entity type vs cache tag
  // name) and are therefore kept separate. Nothing but this test stops them from drifting:
  // a dependency added to one and forgotten in the other would purge on an admin write but
  // not after a sync, or the reverse, and neither path would fail.
  it.each([
    ["affair", "affairs"],
    ["politician", "politicians"],
    ["party", "parties"],
    ["factcheck", "factchecks"],
    ["vote", "votes"],
  ] as const)("describes %s the same way as the %s tag", async (entity, cacheTag) => {
    invalidateEntity(entity);
    await flushAfter();
    const fromEntity = dangerouslyDeleteByTag.mock.calls.map((call) => call[0]).sort();

    dangerouslyDeleteByTag.mockClear();
    revalidateTags([cacheTag]);
    await flushAfter();
    const fromCacheTag = dangerouslyDeleteByTag.mock.calls.map((call) => call[0]).sort();

    expect(fromEntity).toEqual(fromCacheTag);
    expect(fromEntity.length).toBeGreaterThan(0);
  });
});
