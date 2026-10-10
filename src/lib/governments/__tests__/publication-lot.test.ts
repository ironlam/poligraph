import { describe, expect, it, vi } from "vitest";
import { diffPrediction, revalidateProfilePaths, splitTransitions } from "../publication-lot";

function deps() {
  const calls: unknown[] = [];
  const fetchImpl = vi.fn(async (url: unknown, init?: { body?: string; headers?: unknown }) => {
    calls.push({ url, body: JSON.parse(init!.body!), headers: init!.headers });
    return new Response("{}", { status: 200 });
  });
  const sleep = vi.fn(async () => {});
  return {
    calls,
    sleep,
    d: {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      siteUrl: "https://site.test/",
      cronSecret: "s3",
      sleep,
    },
  };
}

describe("revalidateProfilePaths", () => {
  it("envoie des lots de 10 espacés puis le seul tag gouvernements", async () => {
    const { calls, sleep, d } = deps();
    const slugs = Array.from({ length: 23 }, (_, i) => `p-${i}`);

    await revalidateProfilePaths(slugs, d);

    const bodies = calls.map((c) => (c as { body: unknown }).body) as Record<string, string[]>[];
    expect(bodies.map((b) => b.paths?.length)).toEqual([10, 10, 3, undefined]);
    expect(bodies[3]).toEqual({ tags: ["gouvernements"], expireNow: true });
    expect(bodies[0]?.paths?.[0]).toBe("/politiques/p-0");
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(30_000);
    expect((calls[0] as { url: string }).url).toBe("https://site.test/api/cron/revalidate");
    expect((calls[0] as { headers: Record<string, string> }).headers["authorization"]).toBe(
      "Bearer s3"
    );
  });

  it("s'arrête sur une réponse en erreur", async () => {
    const { d } = deps();
    d.fetchImpl = vi.fn(async () => new Response("no", { status: 401 })) as unknown as typeof fetch;
    await expect(revalidateProfilePaths(["a"], d)).rejects.toThrow(/401/);
  });
});

describe("splitTransitions", () => {
  it("ne retient que les publications, le reste est hors lot", () => {
    const { concerned, notConcerned } = splitTransitions([
      { id: "a", from: "DRAFT", to: "PUBLISHED" },
      { id: "b", from: "DRAFT", to: "ARCHIVED" },
      { id: "c", from: "ARCHIVED", to: "EXCLUDED" },
    ]);
    expect(concerned.map((t) => t.id)).toEqual(["a"]);
    expect(notConcerned.map((t) => t.id)).toEqual(["b", "c"]);
  });
});

describe("diffPrediction", () => {
  it("accepte des listes identiques dans un autre ordre", () => {
    expect(diffPrediction(["a", "b"], ["b", "a"]).ok).toBe(true);
  });

  it("signale les fiches prévues non basculées et les basculées imprévues", () => {
    expect(diffPrediction(["a", "b"], ["b", "c"])).toEqual({
      ok: false,
      missing: ["a"],
      unexpected: ["c"],
    });
  });
});
