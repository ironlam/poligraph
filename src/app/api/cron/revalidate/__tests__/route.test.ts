import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  revalidateTags: vi.fn(),
  revalidateAll: vi.fn(),
  requestProfileReconcile: vi.fn(),
}));

vi.mock("@/lib/cache", () => ({
  revalidateTags: h.revalidateTags,
  revalidateAll: h.revalidateAll,
}));
vi.mock("@/lib/politicians/profile-snapshot/events", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/politicians/profile-snapshot/events")>()),
  requestProfileReconcile: h.requestProfileReconcile,
}));

import { POST } from "../route";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function req(body: unknown): any {
  return new Request("http://test/api/cron/revalidate", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { authorization: "Bearer secret", "content-type": "application/json" },
  });
}

describe("POST /api/cron/revalidate : rattrapage des fiches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv("CRON_SECRET", "secret");
    vi.stubEnv("PROFILE_SNAPSHOT_AUTO_RECONCILE", "true");
    h.requestProfileReconcile.mockResolvedValue({ sent: 1 });
  });

  it("demande un rattrapage quand un tag de fiche est revalidé", async () => {
    const res = await POST(req({ tags: ["stats", "votes"] }));

    expect(await res.json()).toEqual({ revalidated: ["stats", "votes"] });
    expect(h.revalidateTags).toHaveBeenCalledWith(["stats", "votes"]);
    expect(h.requestProfileReconcile).toHaveBeenCalledWith("cron:stats,votes");
  });

  it("ne demande rien pour des tags qui ne touchent pas les fiches", async () => {
    const res = await POST(req({ tags: ["stats"] }));

    expect(await res.json()).toEqual({ revalidated: ["stats"] });
    expect(h.requestProfileReconcile).not.toHaveBeenCalled();
  });

  it("demande un rattrapage sur la revalidation complète, réponse inchangée", async () => {
    const res = await POST(req({ all: true }));

    expect(await res.json()).toEqual({ revalidated: "all", deprecated: true });
    expect(h.requestProfileReconcile).toHaveBeenCalledWith("cron:all");
  });

  it.each([
    ["absent", undefined],
    ['"false"', "false"],
    ['"TRUE"', "TRUE"],
  ])("ne demande aucun rattrapage quand l'interrupteur est %s", async (_label, value) => {
    vi.stubEnv("PROFILE_SNAPSHOT_AUTO_RECONCILE", value);

    const tagged = await POST(req({ tags: ["politicians", "votes"] }));
    const all = await POST(req({ all: true }));

    expect(await tagged.json()).toEqual({ revalidated: ["politicians", "votes"] });
    expect(await all.json()).toEqual({ revalidated: "all", deprecated: true });
    expect(h.revalidateTags).toHaveBeenCalledWith(["politicians", "votes"]);
    expect(h.revalidateAll).toHaveBeenCalled();
    expect(h.requestProfileReconcile).not.toHaveBeenCalled();
  });
});
