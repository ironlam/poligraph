import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  changeProfilePublication: vi.fn(),
  invalidateEntity: vi.fn(),
  refreshProfilesForModeration: vi.fn(),
  invalidatePresidentialCandidacyTags: vi.fn(),
}));

vi.mock("@/lib/politicians/publication", () => ({
  changeProfilePublication: h.changeProfilePublication,
}));
vi.mock("@/lib/cache", () => ({ invalidateEntity: h.invalidateEntity }));
vi.mock("@/lib/politicians/profile-snapshot/moderation", () => ({
  refreshProfilesForModeration: h.refreshProfilesForModeration,
}));
vi.mock("@/lib/presidentielle/candidacy-cache", () => ({
  invalidatePresidentialCandidacyTags: h.invalidatePresidentialCandidacyTags,
}));
vi.mock("@/lib/api/with-admin-auth", () => ({
  withAdminAuth: (fn: (req: unknown, ctx: unknown) => unknown) => (req: unknown, ctx: unknown) =>
    fn(req, ctx),
}));

import { POST } from "@/app/api/admin/politiques/[id]/publication/route";

function call(body: unknown) {
  return POST(
    {
      json: async () => body,
      headers: new Headers({ "x-forwarded-for": "203.0.113.1", "user-agent": "test-agent" }),
    } as never,
    { params: Promise.resolve({ id: "pol_1" }) } as never
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  h.changeProfilePublication.mockResolvedValue({
    kind: "changed",
    politician: { id: "pol_1", slug: "camille-riviere", publicationStatus: "DRAFT" },
    presidentialElectionIds: ["el_2027"],
  });
});

describe("POST /api/admin/politiques/[id]/publication", () => {
  it("recalcule la fiche dans la requête, puis purge la fiche et les candidatures", async () => {
    const res = await call({ action: "draft" });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ publicationStatus: "DRAFT", changed: true });
    expect(h.changeProfilePublication).toHaveBeenCalledWith("pol_1", "draft", {
      ip: "203.0.113.1",
      userAgent: "test-agent",
    });
    expect(h.refreshProfilesForModeration).toHaveBeenCalledWith(
      { politicianIds: ["pol_1"] },
      "admin:fiche-publication"
    );
    expect(h.invalidateEntity).toHaveBeenCalledWith("politician", "camille-riviere");
    expect(h.invalidatePresidentialCandidacyTags).toHaveBeenCalledWith("el_2027");
  });

  it("refuse un statut envoyé à la place d'un geste", async () => {
    for (const body of [{ publicationStatus: "PUBLISHED" }, { action: "PUBLISHED" }, {}]) {
      expect((await call(body)).status).toBe(400);
    }
    expect(h.changeProfilePublication).not.toHaveBeenCalled();
  });

  it.each([
    [{ kind: "not-found" }, 404, "Fiche non trouvée"],
    [{ kind: "no-source" }, 409, "ni mandat sourcé ni identifiant externe"],
    [{ kind: "has-published-affair", count: 1 }, 409, "1 affaire publiée. Dépubliez-la d'abord"],
    [{ kind: "has-published-affair", count: 2 }, 409, "2 affaires publiées. Dépubliez-les d'abord"],
  ])("sur %j, répond %i sans rien purger", async (result, status, message) => {
    h.changeProfilePublication.mockResolvedValue(result);
    const res = await call({ action: "draft" });

    expect(res.status).toBe(status);
    expect((await res.json()).error).toContain(message);
    expect(h.refreshProfilesForModeration).not.toHaveBeenCalled();
    expect(h.invalidateEntity).not.toHaveBeenCalled();
  });

  it("ne purge rien quand le statut était déjà celui demandé", async () => {
    h.changeProfilePublication.mockResolvedValue({ kind: "unchanged", publicationStatus: "DRAFT" });
    const res = await call({ action: "draft" });

    expect(await res.json()).toEqual({ publicationStatus: "DRAFT", changed: false });
    expect(h.invalidateEntity).not.toHaveBeenCalled();
  });
});
