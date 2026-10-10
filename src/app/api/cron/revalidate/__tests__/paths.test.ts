import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  revalidateTags: vi.fn(),
  revalidateAll: vi.fn(),
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

describe("POST /api/cron/revalidate : chemins", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv("CRON_SECRET", "secret");
  });

  it("revalide chaque chemin une fois, sans toucher aux tags", async () => {
    const paths = [
      "/politiques/jean-dupont",
      "/politiques/gouvernements",
      "/politiques/gouvernements/lecornu-2",
    ];
    const res = await POST(req({ paths }));

    expect(res.status).toBe(200);
    expect(h.revalidatePath).toHaveBeenCalledTimes(3);
    for (const p of paths) expect(h.revalidatePath).toHaveBeenCalledWith(p);
    expect(h.revalidateTags).not.toHaveBeenCalled();
    expect(h.requestProfileReconcile).not.toHaveBeenCalled();
  });

  it("accepte chemins et tags dans la même requête", async () => {
    const res = await POST(req({ paths: ["/politiques/jean-dupont"], tags: ["gouvernements"] }));

    expect(res.status).toBe(200);
    expect(h.revalidatePath).toHaveBeenCalledTimes(1);
    expect(h.revalidateTags).toHaveBeenCalledWith(["gouvernements"]);
  });

  it("expire immédiatement « gouvernements » sur demande, et aucun autre tag", async () => {
    const res = await POST(req({ tags: ["gouvernements", "politicians"], expireNow: true }));

    expect(res.status).toBe(200);
    expect(h.revalidateTags).toHaveBeenCalledWith(["gouvernements", "politicians"]);
    expect(h.revalidateTag).toHaveBeenCalledTimes(1);
    expect(h.revalidateTag).toHaveBeenCalledWith("gouvernements", { expire: 0 });
  });

  it("n'expire rien sans expireNow", async () => {
    await POST(req({ tags: ["gouvernements"] }));
    expect(h.revalidateTag).not.toHaveBeenCalled();
  });

  it.each([
    ["/"],
    ["/politiques"],
    ["/politiques/a/b"],
    ["/politiques/Jean"],
    ["/affaires/x"],
    ["/politiques/../admin"],
    ["/politiques/gouvernements/a/b"],
  ])("refuse le chemin %s", async (path) => {
    const res = await POST(req({ paths: [path] }));

    expect(res.status).toBe(400);
    expect(h.revalidatePath).not.toHaveBeenCalled();
  });

  it("refuse 11 chemins", async () => {
    const paths = Array.from({ length: 11 }, (_, i) => `/politiques/p-${i}`);
    const res = await POST(req({ paths }));

    expect(res.status).toBe(400);
    expect(h.revalidatePath).not.toHaveBeenCalled();
  });

  it("accepte 10 chemins", async () => {
    const paths = Array.from({ length: 10 }, (_, i) => `/politiques/p-${i}`);
    expect((await POST(req({ paths }))).status).toBe(200);
    expect(h.revalidatePath).toHaveBeenCalledTimes(10);
  });

  it("refuse sans jeton ou avec un jeton invalide", async () => {
    expect((await POST(req({ paths: ["/politiques/a"] }, null))).status).toBe(401);
    expect((await POST(req({ paths: ["/politiques/a"] }, "Bearer nope"))).status).toBe(401);
    expect(h.revalidatePath).not.toHaveBeenCalled();
  });
});
