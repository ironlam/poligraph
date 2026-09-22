import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const dangerouslyDeleteByTag = vi.fn().mockResolvedValue(undefined);
const captureException = vi.fn();
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

import { invalidateEntity, revalidateAll } from "@/lib/cache";

/** Run what `after()` collected, the way the platform would after the response. */
async function flushAfter() {
  const callbacks = scheduled.splice(0);
  for (const callback of callbacks) await callback();
}

describe("purge des exports depuis invalidateEntity", () => {
  beforeEach(() => {
    vi.stubEnv("VERCEL", "1");
    dangerouslyDeleteByTag.mockClear();
    captureException.mockClear();
    scheduled.length = 0;
    afterThrows = false;
  });
  afterEach(() => vi.unstubAllEnvs());

  it("hard-deletes the affairs export when an affair is written", async () => {
    invalidateEntity("affair", "une-affaire");
    await flushAfter();
    expect(dangerouslyDeleteByTag).toHaveBeenCalledWith("export:affairs", {
      revalidationDeadlineSeconds: 10,
    });
  });

  it.each([
    ["politician", "export:politicians"],
    ["factcheck", "export:factchecks"],
    ["vote", "export:votes"],
  ] as const)("hard-deletes %s exports", async (type, tag) => {
    invalidateEntity(type);
    await flushAfter();
    expect(dangerouslyDeleteByTag).toHaveBeenCalledWith(tag, {
      revalidationDeadlineSeconds: 10,
    });
  });

  it("purges nothing for an entity that has no CSV export", async () => {
    invalidateEntity("party", "un-parti");
    invalidateEntity("dossier");
    await flushAfter();
    expect(dangerouslyDeleteByTag).not.toHaveBeenCalled();
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
    expect(dangerouslyDeleteByTag).toHaveBeenCalledWith("exports", {
      revalidationDeadlineSeconds: 10,
    });
  });

  it("purges the rollup tag once, not once per tag in ALL_TAGS", async () => {
    revalidateAll();
    await flushAfter();
    expect(dangerouslyDeleteByTag).toHaveBeenCalledTimes(1);
  });
});
