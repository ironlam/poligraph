import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  revalidateTags: vi.fn(),
  revalidateAll: vi.fn(),
  inngestSend: vi.fn(),
  requestProfileReconcile: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: h.revalidatePath,
  revalidateTag: h.revalidateTag,
}));
vi.mock("@/lib/cache", () => ({
  revalidateTags: h.revalidateTags,
  revalidateAll: h.revalidateAll,
}));
vi.mock("@/lib/politicians/profile-snapshot/events", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/politicians/profile-snapshot/events")>()),
  inngestSend: h.inngestSend,
  requestProfileReconcile: h.requestProfileReconcile,
}));

import { POST } from "../route";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function req(body: unknown, auth: string | null = "Bearer secret"): any {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (auth) headers.authorization = auth;
  return new Request("http://test/api/cron/revalidate", {
    method: "POST",
    body: JSON.stringify(body),
    headers,
  });
}

describe("POST /api/cron/revalidate : relais des demandes de profil", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv("CRON_SECRET", "secret");
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("refuse sans le secret", async () => {
    const res = await POST(
      req({ profileRefresh: { politicianIds: ["a"], reason: "r" } }, "Bearer autre")
    );
    expect(res.status).toBe(401);
    expect(h.inngestSend).not.toHaveBeenCalled();
  });

  it("envoie un événement par fiche, sans doublon et sans purge", async () => {
    const res = await POST(
      req({ profileRefresh: { politicianIds: ["a", "b", "a"], reason: "sync:photos" } })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ relayed: 2 });
    expect(h.inngestSend).toHaveBeenCalledWith([
      { name: "politician/profile.refresh", data: { politicianId: "a", reason: "sync:photos" } },
      { name: "politician/profile.refresh", data: { politicianId: "b", reason: "sync:photos" } },
    ]);
    expect(h.revalidateTags).not.toHaveBeenCalled();
    expect(h.revalidatePath).not.toHaveBeenCalled();
    expect(h.requestProfileReconcile).not.toHaveBeenCalled();
  });

  it("refuse plus de 100 fiches, un identifiant mal formé ou une raison vide", async () => {
    const tooMany = Array.from({ length: 101 }, (_, i) => `id${i}`);
    for (const profileRefresh of [
      { politicianIds: tooMany, reason: "r" },
      { politicianIds: ["../etc"], reason: "r" },
      { politicianIds: [], reason: "r" },
      { politicianIds: ["a"], reason: "" },
    ]) {
      const res = await POST(req({ profileRefresh }));
      expect(res.status).toBe(400);
    }
    expect(h.inngestSend).not.toHaveBeenCalled();
  });

  it("relaie un rattrapage complet ou limité aux profils actifs", async () => {
    await POST(req({ profileReconcile: { reason: "x", active: false } }));
    await POST(req({ profileReconcile: { reason: "y", active: true } }));
    expect(h.inngestSend.mock.calls).toEqual([
      [[{ name: "politician/profile.reconcile", data: { reason: "x" } }]],
      [[{ name: "politician/profile.reconcile-active", data: { reason: "y" } }]],
    ]);
  });

  it("répond 502 quand l'envoi à Inngest échoue", async () => {
    h.inngestSend.mockRejectedValueOnce(new Error("no event key"));
    const res = await POST(req({ profileRefresh: { politicianIds: ["a"], reason: "r" } }));
    expect(res.status).toBe(502);
  });
});
