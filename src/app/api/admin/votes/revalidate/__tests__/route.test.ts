import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  scrutinFindMany: vi.fn(),
  auditCreate: vi.fn(),
  revalidateTags: vi.fn(),
  revalidatePublicPathsForScrutin: vi.fn(),
  requestProfileRefresh: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    scrutin: { findMany: h.scrutinFindMany },
    auditLog: { create: h.auditCreate },
  },
}));
vi.mock("@/lib/cache", () => ({ revalidateTags: h.revalidateTags }));
vi.mock("@/lib/votes/revalidate-public", () => ({
  revalidatePublicPathsForScrutin: h.revalidatePublicPathsForScrutin,
}));
vi.mock("@/lib/politicians/profile-snapshot/request", () => ({
  requestProfileRefresh: h.requestProfileRefresh,
}));
vi.mock("@/lib/api/with-admin-auth", () => ({
  withAdminAuth: (fn: (req: unknown, ctx: unknown) => unknown) => fn,
}));

import { POST } from "../route";

async function post(scrutinIds: string[]) {
  const request = new Request("https://poligraph.fr/api/admin/votes/revalidate", {
    method: "POST",
    body: JSON.stringify({ scrutinIds }),
    headers: { "content-type": "application/json" },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return POST(request as any, { params: Promise.resolve({}) } as any);
}

describe("POST /api/admin/votes/revalidate : recalcul des fiches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    h.scrutinFindMany.mockResolvedValue([
      { id: "s1", policyTitle: { status: "APPROVED" } },
      { id: "s2", policyTitle: { status: "DRAFT" } },
    ]);
  });

  it("ne demande aucun recalcul sans l'interrupteur, mais revalide les votes", async () => {
    const res = await post(["s1", "s2"]);

    expect(await res.json()).toEqual({ revalidated: ["s1"], skipped: expect.any(Array) });
    expect(h.revalidateTags).toHaveBeenCalledWith(["votes"], "max");
    expect(h.requestProfileRefresh).not.toHaveBeenCalled();
  });

  it('ne demande aucun recalcul si l\'interrupteur vaut autre chose que "true"', async () => {
    vi.stubEnv("PROFILE_SNAPSHOT_AUTO_RECONCILE", "false");
    await post(["s1", "s2"]);
    expect(h.requestProfileRefresh).not.toHaveBeenCalled();
  });

  it('demande le recalcul des votants des seuls titres approuvés quand il vaut "true"', async () => {
    vi.stubEnv("PROFILE_SNAPSHOT_AUTO_RECONCILE", "true");
    await post(["s1", "s2"]);
    expect(h.requestProfileRefresh).toHaveBeenCalledExactlyOnceWith(
      { scrutinIds: ["s1"] },
      "admin:votes-revalidés"
    );
  });
});
