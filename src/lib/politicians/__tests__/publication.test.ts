import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  mandateCount: vi.fn(),
  externalIdCount: vi.fn(),
  affairCount: vi.fn(),
  candidacyFindMany: vi.fn(),
  politicianUpdate: vi.fn(),
  auditCreate: vi.fn(),
  lockMeasureCandidacy: vi.fn(),
  syncSearch: vi.fn(),
  order: [] as string[],
}));

vi.mock("@/lib/db", () => {
  const tx = {
    $queryRaw: h.queryRaw,
    mandate: { count: h.mandateCount },
    externalId: { count: h.externalIdCount },
    affair: { count: h.affairCount },
    candidacy: { findMany: h.candidacyFindMany },
    politician: { update: h.politicianUpdate },
    auditLog: { create: h.auditCreate },
  };
  return { db: { $transaction: (fn: (client: typeof tx) => unknown) => fn(tx) } };
});
vi.mock("@/lib/affairs/publish-guard", () => ({ PUBLISHED_STATUS: "PUBLISHED" }));
vi.mock("@/lib/measures/lock", () => ({ lockMeasureCandidacy: h.lockMeasureCandidacy }));
vi.mock("@/lib/presidentielle/search-sync", () => ({
  syncPresidentialSearchDocumentsForCandidacy: h.syncSearch,
}));

import { changeProfilePublication } from "../publication";

const META = { ip: "203.0.113.1", userAgent: "test-agent" };

function profileIs(publicationStatus: string) {
  h.queryRaw.mockImplementation(async () => {
    h.order.push("lock-profile");
    return [{ id: "pol_1", slug: "camille-riviere", publicationStatus }];
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.order.length = 0;
  profileIs("DRAFT");
  h.mandateCount.mockResolvedValue(1);
  h.externalIdCount.mockResolvedValue(0);
  h.affairCount.mockResolvedValue(0);
  h.candidacyFindMany.mockResolvedValue([]);
  h.politicianUpdate.mockImplementation(async ({ data }) => {
    h.order.push("update");
    return { id: "pol_1", slug: "camille-riviere", publicationStatus: data.publicationStatus };
  });
  h.auditCreate.mockResolvedValue({});
  h.lockMeasureCandidacy.mockImplementation(async () => void h.order.push("lock-candidacy"));
  h.syncSearch.mockImplementation(async () => void h.order.push("sync-search"));
});

describe("changeProfilePublication", () => {
  it("publie une fiche qui a un mandat sourcé, et fixe le statut à la main", async () => {
    const result = await changeProfilePublication("pol_1", "publish", META);

    expect(result).toMatchObject({
      kind: "changed",
      politician: { publicationStatus: "PUBLISHED" },
      presidentialElectionIds: [],
    });
    expect(h.politicianUpdate.mock.calls[0]![0].data).toEqual({
      publicationStatus: "PUBLISHED",
      statusOverride: true,
    });
    expect(h.mandateCount.mock.calls[0]![0].where).toEqual({
      politicianId: "pol_1",
      sourceUrl: { not: null },
    });
  });

  it("accepte un identifiant externe à la place d'un mandat sourcé", async () => {
    h.mandateCount.mockResolvedValue(0);
    h.externalIdCount.mockResolvedValue(1);
    expect((await changeProfilePublication("pol_1", "publish", META)).kind).toBe("changed");
  });

  it("refuse de publier une fiche sans rien de vérifiable, sans écrire", async () => {
    h.mandateCount.mockResolvedValue(0);

    expect(await changeProfilePublication("pol_1", "publish", META)).toEqual({ kind: "no-source" });
    expect(h.politicianUpdate).not.toHaveBeenCalled();
    expect(h.auditCreate).not.toHaveBeenCalled();
  });

  it.each(["draft", "archive", "exclude"] as const)(
    "refuse le geste « %s » tant qu'une affaire de la fiche est publiée",
    async (action) => {
      profileIs("PUBLISHED");
      h.affairCount.mockResolvedValue(2);

      expect(await changeProfilePublication("pol_1", action, META)).toEqual({
        kind: "has-published-affair",
        count: 2,
      });
      expect(h.affairCount.mock.calls[0]![0].where).toEqual({
        politicianId: "pol_1",
        publicationStatus: "PUBLISHED",
      });
      expect(h.politicianUpdate).not.toHaveBeenCalled();
    }
  );

  it("ne regarde pas les affaires pour passer d'un statut non public à un autre", async () => {
    profileIs("DRAFT");
    h.affairCount.mockResolvedValue(3);

    const result = await changeProfilePublication("pol_1", "archive", META);

    expect(result).toMatchObject({
      kind: "changed",
      politician: { publicationStatus: "ARCHIVED" },
    });
    expect(h.affairCount).not.toHaveBeenCalled();
    // No source is asked of a profile that is not being published.
    expect(h.mandateCount).not.toHaveBeenCalled();
  });

  it("remet en brouillon une fiche publiée sans affaire publiée", async () => {
    profileIs("PUBLISHED");
    const result = await changeProfilePublication("pol_1", "draft", META);
    expect(result).toMatchObject({ kind: "changed", politician: { publicationStatus: "DRAFT" } });
  });

  it("ne fait rien, et n'écrit pas d'audit, quand le statut est déjà celui demandé", async () => {
    profileIs("PUBLISHED");

    expect(await changeProfilePublication("pol_1", "publish", META)).toEqual({
      kind: "unchanged",
      publicationStatus: "PUBLISHED",
    });
    expect(h.politicianUpdate).not.toHaveBeenCalled();
    expect(h.auditCreate).not.toHaveBeenCalled();
  });

  it("écrit dans l'audit le statut d'avant, celui d'après et le geste", async () => {
    profileIs("PUBLISHED");
    await changeProfilePublication("pol_1", "exclude", META);

    expect(h.auditCreate.mock.calls[0]![0].data).toEqual({
      action: "UPDATE",
      entityType: "Politician",
      entityId: "pol_1",
      changes: {
        publicationStatus: { from: "PUBLISHED", to: "EXCLUDED" },
        statusOverride: true,
        gesture: "exclude",
      },
      ipAddress: "203.0.113.1",
      userAgent: "test-agent",
    });
  });

  it("verrouille les candidatures présidentielles puis la fiche avant d'écrire, et resynchronise la recherche", async () => {
    profileIs("PUBLISHED");
    h.candidacyFindMany.mockResolvedValue([
      { id: "cand_1", electionId: "el_2027" },
      { id: "cand_2", electionId: "el_2027" },
    ]);

    const result = await changeProfilePublication("pol_1", "draft", META);

    // Candidacies before the profile: the order the edit route takes them in. The reverse
    // order deadlocks a civil-status save against a publication gesture.
    expect(h.order).toEqual([
      "lock-candidacy",
      "lock-candidacy",
      "lock-profile",
      "update",
      "sync-search",
      "sync-search",
    ]);
    expect(result).toMatchObject({ presidentialElectionIds: ["el_2027"] });
  });

  it("répond « introuvable » pour une fiche qui n'existe pas", async () => {
    h.queryRaw.mockImplementation(async () => []);
    expect(await changeProfilePublication("pol_x", "publish", META)).toEqual({ kind: "not-found" });
  });

  it("laisse remonter l'échec de l'audit, pour que la transaction annule le changement", async () => {
    h.auditCreate.mockRejectedValue(new Error("audit indisponible"));
    await expect(changeProfilePublication("pol_1", "publish", META)).rejects.toThrow(
      "audit indisponible"
    );
  });
});
