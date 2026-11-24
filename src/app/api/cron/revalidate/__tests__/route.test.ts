import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  revalidateTags: vi.fn(),
  revalidateAll: vi.fn(),
  requestProfileReconcile: vi.fn(),
  requestActiveProfileReconcile: vi.fn(),
}));

vi.mock("@/lib/cache", () => ({
  revalidateTags: h.revalidateTags,
  revalidateAll: h.revalidateAll,
}));
vi.mock("@/lib/politicians/profile-snapshot/events", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/politicians/profile-snapshot/events")>()),
  requestProfileReconcile: h.requestProfileReconcile,
  requestActiveProfileReconcile: h.requestActiveProfileReconcile,
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
    h.requestProfileReconcile.mockResolvedValue({ sent: 1 });
    h.requestActiveProfileReconcile.mockResolvedValue({ sent: 1 });
  });

  it.each([["votes"], ["factchecks"]])(
    "limite le rattrapage aux fiches actives quand %s est revalidé",
    async (tag) => {
      const res = await POST(req({ tags: ["stats", tag] }));

      expect(await res.json()).toEqual({ revalidated: ["stats", tag] });
      expect(h.revalidateTags).toHaveBeenCalledWith(["stats", tag]);
      expect(h.requestActiveProfileReconcile).toHaveBeenCalledExactlyOnceWith(`cron:stats,${tag}`);
      expect(h.requestProfileReconcile).not.toHaveBeenCalled();
    }
  );

  it("demande le rattrapage complet, et lui seul, quand politicians est revalidé", async () => {
    await POST(req({ tags: ["factchecks", "politicians", "votes"] }));

    expect(h.requestProfileReconcile).toHaveBeenCalledExactlyOnceWith(
      "cron:factchecks,politicians,votes"
    );
    expect(h.requestActiveProfileReconcile).not.toHaveBeenCalled();
  });

  it("ne demande rien pour des tags qui ne touchent pas les fiches", async () => {
    const res = await POST(req({ tags: ["stats"] }));

    expect(await res.json()).toEqual({ revalidated: ["stats"] });
    expect(h.requestProfileReconcile).not.toHaveBeenCalled();
    expect(h.requestActiveProfileReconcile).not.toHaveBeenCalled();
  });

  it("demande un rattrapage sur la revalidation complète, réponse inchangée", async () => {
    const res = await POST(req({ all: true }));

    expect(await res.json()).toEqual({ revalidated: "all", deprecated: true });
    expect(h.requestProfileReconcile).toHaveBeenCalledWith("cron:all");
  });
});
