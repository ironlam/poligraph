import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  scrutinFindMany: vi.fn(),
  auditCreate: vi.fn(),
  revalidateTags: vi.fn(),
  revalidatePublicPathsForScrutin: vi.fn(),
  revalidateVotePage: vi.fn(),
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
  revalidateVotePage: h.revalidateVotePage,
}));
vi.mock("@/lib/politicians/profile-snapshot/request", () => ({
  requestProfileRefresh: h.requestProfileRefresh,
}));
vi.mock("@/lib/api/with-admin-auth", () => ({
  withAdminAuth: (fn: (req: unknown, ctx: unknown) => unknown) => fn,
}));

import { POST } from "../route";

async function post(scrutinIds: string[], scope?: "all" | "page") {
  const request = new Request("https://poligraph.fr/api/admin/votes/revalidate", {
    method: "POST",
    body: JSON.stringify({ scrutinIds, scope }),
    headers: { "content-type": "application/json" },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return POST(request as any, { params: Promise.resolve({}) } as any);
}

describe("POST /api/admin/votes/revalidate : recalcul des fiches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.scrutinFindMany.mockResolvedValue([
      { id: "s1", policyTitle: { status: "APPROVED" } },
      { id: "s2", policyTitle: { status: "DRAFT" } },
    ]);
  });

  it("revalide les votes et demande le recalcul des votants des seuls titres approuvés", async () => {
    const res = await post(["s1", "s2"]);

    expect(await res.json()).toEqual({
      revalidated: ["s1"],
      skipped: expect.any(Array),
      scope: "all",
    });
    expect(h.revalidateTags).toHaveBeenCalledWith(["votes"], "max");
    expect(h.requestProfileRefresh).toHaveBeenCalledExactlyOnceWith(
      { scrutinIds: ["s1"] },
      "admin:votes-revalidés"
    );
  });

  it("ne demande aucun recalcul quand aucun titre n'est approuvé", async () => {
    await post(["s2"]);
    expect(h.requestProfileRefresh).not.toHaveBeenCalled();
  });

  it("en scope page, ne revalide que la page des titres approuvés, sans tag ni fiches votants", async () => {
    const res = await post(["s1", "s2"], "page");

    expect(await res.json()).toEqual({
      revalidated: ["s1"],
      skipped: expect.any(Array),
      scope: "page",
    });
    expect(h.revalidateVotePage).toHaveBeenCalledExactlyOnceWith("s1");
    expect(h.revalidatePublicPathsForScrutin).not.toHaveBeenCalled();
    expect(h.revalidateTags).not.toHaveBeenCalled();
    expect(h.requestProfileRefresh).not.toHaveBeenCalled();
  });
});
