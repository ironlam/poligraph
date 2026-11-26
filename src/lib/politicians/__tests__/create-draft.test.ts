import { beforeEach, describe, expect, it, vi } from "vitest";

// Creating a profile is the one admin write that can duplicate a person. What matters here is
// what the function refuses, and that nothing is written when it refuses.

const h = vi.hoisted(() => ({
  executeRaw: vi.fn(),
  findUnique: vi.fn(),
  create: vi.fn(),
  auditCreate: vi.fn(),
  findHomonymIds: vi.fn(),
  findHomonyms: vi.fn(),
}));

vi.mock("@/lib/db", () => {
  const tx = {
    // No $queryRaw on purpose: the lock returns `void`, which the pg adapter cannot deserialize
    // through it. A lock taken with $queryRaw breaks every test here, as it broke the route.
    $executeRaw: h.executeRaw,
    politician: { findUnique: h.findUnique, create: h.create },
    auditLog: { create: h.auditCreate },
  };
  return {
    db: {
      // The callback's rejection must reach the caller: that is what rolls a transaction back.
      $transaction: (fn: (client: typeof tx) => unknown) => fn(tx),
    },
  };
});
vi.mock("../homonyms", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../homonyms")>()),
  findHomonymIds: h.findHomonymIds,
  findHomonyms: h.findHomonyms,
}));

import { createDraftPolitician } from "../create-draft";

const META = { ip: "203.0.113.1", userAgent: "test-agent" };
const INPUT = { firstName: " Camille ", lastName: "Rivière-Dupont", acknowledgedHomonymIds: [] };

beforeEach(() => {
  vi.clearAllMocks();
  h.executeRaw.mockResolvedValue(1);
  h.findHomonymIds.mockResolvedValue([]);
  h.findHomonyms.mockResolvedValue([]);
  h.findUnique.mockResolvedValue(null);
  h.create.mockResolvedValue({ id: "pol_new", slug: "camille-riviere-dupont", publicId: "PG-1" });
  h.auditCreate.mockResolvedValue({});
});

describe("createDraftPolitician", () => {
  it("crée la fiche en brouillon protégé, avec son nom normalisé", async () => {
    const result = await createDraftPolitician(INPUT, META);

    expect(result).toEqual({
      kind: "created",
      politician: { id: "pol_new", slug: "camille-riviere-dupont", publicId: "PG-1" },
    });
    expect(h.create.mock.calls[0]![0].data).toEqual({
      slug: "camille-riviere-dupont",
      firstName: "Camille",
      lastName: "Rivière-Dupont",
      fullName: "Camille Rivière-Dupont",
      normalizedLastName: "riviere dupont",
      civility: null,
      birthDate: null,
      birthPlace: null,
      publicationStatus: "DRAFT",
      statusOverride: true,
      source: "MANUAL",
    });
  });

  it("garde inconnu ce qui n'est pas saisi, et la date telle qu'elle est donnée", async () => {
    await createDraftPolitician(
      { ...INPUT, civility: "Mme", birthDate: "1975-03-02", birthPlace: "  " },
      META
    );
    const data = h.create.mock.calls[0]![0].data;
    expect(data.civility).toBe("Mme");
    expect(data.birthDate).toEqual(new Date("1975-03-02"));
    expect(data.birthPlace).toBeNull();
  });

  it("écrit l'audit avec les homonymes vus, l'adresse et le navigateur", async () => {
    h.findHomonymIds.mockResolvedValue(["pol_b", "pol_a"]);
    await createDraftPolitician({ ...INPUT, acknowledgedHomonymIds: ["pol_b", "pol_a"] }, META);

    expect(h.auditCreate).toHaveBeenCalledTimes(1);
    expect(h.auditCreate.mock.calls[0]![0].data).toMatchObject({
      action: "CREATE",
      entityType: "Politician",
      entityId: "pol_new",
      ipAddress: "203.0.113.1",
      userAgent: "test-agent",
      changes: {
        publicationStatus: "DRAFT",
        statusOverride: true,
        acknowledgedHomonymIds: ["pol_a", "pol_b"],
      },
    });
  });

  it("refuse et n'écrit rien quand un homonyme n'a pas été vu", async () => {
    h.findHomonymIds.mockResolvedValue(["pol_seen", "pol_unseen"]);
    h.findHomonyms.mockResolvedValue([{ id: "pol_seen" }, { id: "pol_unseen" }]);

    const result = await createDraftPolitician(
      { ...INPUT, acknowledgedHomonymIds: ["pol_seen"] },
      META
    );

    expect(result).toEqual({
      kind: "unseen-homonyms",
      homonyms: [{ id: "pol_seen" }, { id: "pol_unseen" }],
    });
    expect(h.create).not.toHaveBeenCalled();
    expect(h.auditCreate).not.toHaveBeenCalled();
  });

  it("refuse la seconde soumission : la fiche créée par la première est un homonyme non vu", async () => {
    await createDraftPolitician(INPUT, META);
    h.findHomonymIds.mockResolvedValue(["pol_new"]);
    h.findHomonyms.mockResolvedValue([{ id: "pol_new" }]);

    const second = await createDraftPolitician(INPUT, META);

    expect(second.kind).toBe("unseen-homonyms");
    expect(h.create).toHaveBeenCalledTimes(1);
  });

  it("prend le verrou sur le nom avant de relire les homonymes", async () => {
    const order: string[] = [];
    h.executeRaw.mockImplementation(async () => {
      order.push("lock");
      return 1;
    });
    h.findHomonymIds.mockImplementation(async () => {
      order.push("homonyms");
      return [];
    });

    await createDraftPolitician(INPUT, META);

    expect(order).toEqual(["lock", "homonyms"]);
    // Same key for the same person typed with other accents, case or hyphens.
    const keyOf = (call: unknown[]) => call[1];
    await createDraftPolitician(
      { ...INPUT, firstName: "CAMILLE", lastName: "riviere dupont" },
      META
    );
    expect(keyOf(h.executeRaw.mock.calls[1]!)).toBe(keyOf(h.executeRaw.mock.calls[0]!));
    expect(keyOf(h.executeRaw.mock.calls[0]!)).toBe("politician-create:riviere dupont:camille");
  });

  it("refuse un slug choisi par l'admin s'il est déjà pris, sans écrire", async () => {
    h.findUnique.mockResolvedValue({ id: "pol_other" });

    const result = await createDraftPolitician({ ...INPUT, slug: "camille-riviere" }, META);

    expect(result).toEqual({ kind: "slug-taken", slug: "camille-riviere" });
    expect(h.create).not.toHaveBeenCalled();
    expect(h.auditCreate).not.toHaveBeenCalled();
  });

  it("donne un slug suffixé à un vrai homonyme, dont le slug du nom est déjà pris", async () => {
    // The namesake was shown and acknowledged: the creation must go through, not stop on the
    // slug the first person already holds.
    h.findHomonymIds.mockResolvedValue(["pol_other"]);
    h.findUnique.mockImplementation(async ({ where }: { where: { slug: string } }) =>
      where.slug === "camille-riviere-dupont" ? { id: "pol_other" } : null
    );

    const result = await createDraftPolitician(
      { ...INPUT, acknowledgedHomonymIds: ["pol_other"] },
      META
    );

    expect(result.kind).toBe("created");
    expect(h.create.mock.calls[0]![0].data.slug).toBe("camille-riviere-dupont-2");
    expect(h.auditCreate.mock.calls[0]![0].data.changes.slug).toBe("camille-riviere-dupont-2");
  });

  it("laisse remonter l'échec de l'audit, pour que la transaction annule la fiche", async () => {
    h.auditCreate.mockRejectedValue(new Error("audit indisponible"));

    await expect(createDraftPolitician(INPUT, META)).rejects.toThrow("audit indisponible");
  });
});
