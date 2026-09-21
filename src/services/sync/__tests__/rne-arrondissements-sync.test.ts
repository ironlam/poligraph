import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const h = vi.hoisted(() => ({
  resolveUrl: vi.fn(),
  getText: vi.fn(),
  mandateFindFirst: vi.fn(),
  mandateUpdate: vi.fn(),
  mandateCreate: vi.fn(),
  politicianFindMany: vi.fn(),
  politicianFindUnique: vi.fn(),
  politicianCreate: vi.fn(),
  transaction: vi.fn(),
  outsideMutation: vi.fn(() => {
    throw new Error("Mutation outside transaction");
  }),
}));

vi.mock("@/lib/db", () => ({
  db: {
    $transaction: h.transaction,
    mandate: {
      findFirst: h.mandateFindFirst,
      update: h.outsideMutation,
      create: h.outsideMutation,
    },
    politician: {
      findMany: h.politicianFindMany,
      findUnique: h.politicianFindUnique,
      create: h.outsideMutation,
    },
  },
}));
vi.mock("@/lib/api/http-client", () => ({
  HTTPClient: class {
    getText = h.getText;
  },
}));
vi.mock("./../rne-resource", () => ({
  resolveRneResourceUrl: h.resolveUrl,
  RNE_ARRONDISSEMENTS_FRAGMENTS: ["arrondissement"],
}));

import { syncArrondissementMayors } from "../rne-arrondissements";

const HEADER =
  "Code du département;Libellé du département;Code de la commune;Libellé de la commune;" +
  "Libellé du secteur;Nom de l'élu;Prénom de l'élu;Code sexe;Date de naissance;" +
  "Code de la catégorie socio-professionnelle;Libellé de la catégorie socio-professionnelle;" +
  "Date de début du mandat;Libellé de la fonction;Date de début de la fonction";

const CSV = [
  HEADER,
  "75;Paris;75056;Paris;Paris 5Eme Secteur;MARTIN;Alice;F;1970-04-02;33;Cadre;2026-03-22;Maire d'arrondissement;2026-04-05",
].join("\n");

beforeEach(() => {
  vi.resetAllMocks();
  h.transaction.mockImplementation(async (callback) =>
    callback({
      mandate: { update: h.mandateUpdate, create: h.mandateCreate },
      politician: { findUnique: h.politicianFindUnique, create: h.politicianCreate },
    })
  );
  h.resolveUrl.mockResolvedValue("https://example.test/ca.csv");
  h.getText.mockResolvedValue({ data: CSV });
  h.mandateFindFirst.mockResolvedValue(null);
  h.politicianFindMany.mockResolvedValue([]);
  h.politicianFindUnique.mockResolvedValue(null);
  h.politicianCreate.mockResolvedValue({ id: "new" });
  h.mandateCreate.mockResolvedValue({ id: "m1" });
  h.mandateUpdate.mockResolvedValue({ id: "old" });
});

afterEach(() => {
  expect(h.outsideMutation).not.toHaveBeenCalled();
});

describe("alternance de maire d'arrondissement", () => {
  it.each([false, true])(
    "ne mute rien lors d'une succession en dry-run (fiche connue : %s)",
    async (known) => {
      h.mandateFindFirst.mockResolvedValue({
        id: "old",
        politician: { firstName: "Benoît", lastName: "DUPONT" },
      });
      if (known)
        h.politicianFindMany.mockResolvedValue([
          {
            id: "alice",
            firstName: "Alice",
            lastName: "MARTIN",
            birthDate: new Date("1970-04-02"),
          },
        ]);

      const stats = await syncArrondissementMayors({ dryRun: true });

      expect(stats.errors).toEqual([]);
      expect(stats.succeeded).toBe(1);
      expect(stats.linkedToExisting).toBe(known ? 1 : 0);
      expect(stats.createdAsDraft).toBe(known ? 0 : 1);
      expect(h.mandateUpdate).not.toHaveBeenCalled();
      expect(h.mandateCreate).not.toHaveBeenCalled();
      expect(h.politicianCreate).not.toHaveBeenCalled();
      expect(h.transaction).not.toHaveBeenCalled();
    }
  );

  it("ne touche à rien quand le maire enregistré est le même", async () => {
    h.mandateFindFirst.mockResolvedValue({
      id: "old",
      politician: { firstName: "Alice", lastName: "MARTIN" },
    });

    const stats = await syncArrondissementMayors();

    expect(stats.alreadyCurrent).toBe(1);
    expect(stats.succeeded).toBe(0);
    expect(h.mandateUpdate).not.toHaveBeenCalled();
    expect(h.mandateCreate).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    "clôt le prédécesseur et ouvre le successeur (fiche connue : %s)",
    async (known) => {
      // Tester la seule existence du secteur rendait la passe non rejouable :
      // un successeur nommé dans un export ultérieur restait ignoré.
      h.mandateFindFirst.mockResolvedValue({
        id: "old",
        politician: { firstName: "Benoît", lastName: "DUPONT" },
      });
      if (known)
        h.politicianFindMany.mockResolvedValue([
          {
            id: "alice",
            firstName: "Alice",
            lastName: "MARTIN",
            birthDate: new Date("1970-04-02"),
          },
        ]);

      const stats = await syncArrondissementMayors();

      expect(stats.succeeded).toBe(1);
      expect(h.mandateUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "old", isCurrent: true },
          data: expect.objectContaining({ isCurrent: false }),
        })
      );
      expect(h.politicianCreate).toHaveBeenCalledTimes(known ? 0 : 1);
      expect(h.mandateCreate).toHaveBeenCalledTimes(known ? 1 : 0);
      expect(stats.linkedToExisting).toBe(known ? 1 : 0);
      expect(stats.createdAsDraft).toBe(known ? 0 : 1);
      expect(h.transaction).toHaveBeenCalledOnce();
    }
  );

  it.each([false, true])(
    "ne compte pas une succession dont la création échoue (fiche connue : %s)",
    async (known) => {
      h.mandateFindFirst.mockResolvedValue({
        id: "old",
        politician: { firstName: "Benoît", lastName: "DUPONT" },
      });
      if (known)
        h.politicianFindMany.mockResolvedValue([
          {
            id: "alice",
            firstName: "Alice",
            lastName: "MARTIN",
            birthDate: new Date("1970-04-02"),
          },
        ]);
      const writer = known ? h.mandateCreate : h.politicianCreate;
      writer.mockRejectedValue(new Error("creation failed"));

      const stats = await syncArrondissementMayors();

      expect(h.transaction).toHaveBeenCalledOnce();
      await expect(h.transaction.mock.results[0]!.value).rejects.toThrow("creation failed");
      expect(h.mandateUpdate).toHaveBeenCalledOnce();
      expect(writer).toHaveBeenCalledOnce();
      expect(stats.succeeded).toBe(0);
      expect(stats.createdAsDraft).toBe(0);
      expect(stats.linkedToExisting).toBe(0);
      expect(stats.errors).toHaveLength(1);
    }
  );

  it("ne clôt rien si la recherche d'identité échoue", async () => {
    h.mandateFindFirst.mockResolvedValue({
      id: "old",
      politician: { firstName: "Benoît", lastName: "DUPONT" },
    });
    h.politicianFindMany.mockRejectedValue(new Error("lookup failed"));
    const stats = await syncArrondissementMayors();
    expect(h.transaction).not.toHaveBeenCalled();
    expect(h.mandateUpdate).not.toHaveBeenCalled();
    expect(stats.succeeded).toBe(0);
    expect(stats.errors).toHaveLength(1);
  });

  it("ne crée pas de successeur si la clôture échoue", async () => {
    h.mandateFindFirst.mockResolvedValue({
      id: "old",
      politician: { firstName: "Benoît", lastName: "DUPONT" },
    });
    h.mandateUpdate.mockRejectedValue(new Error("mandate no longer current"));
    const stats = await syncArrondissementMayors();
    expect(h.politicianCreate).not.toHaveBeenCalled();
    expect(h.mandateCreate).not.toHaveBeenCalled();
    expect(stats.succeeded).toBe(0);
    expect(stats.errors).toHaveLength(1);
  });

  it("date le mandat sur la prise de fonction, pas sur le mandat de conseiller", async () => {
    await syncArrondissementMayors();

    const created = h.politicianCreate.mock.calls[0]![0];
    // Conseiller depuis le 22 mars, maire depuis le 5 avril : la frise lit
    // startDate et le ferait maire deux semaines trop tôt.
    const start: Date = created.data.mandates.create.startDate;
    expect(start.toISOString().slice(0, 10)).toBe("2026-04-05");
  });

  it("n'écrit rien en dry-run", async () => {
    const stats = await syncArrondissementMayors({ dryRun: true });

    expect(stats.createdAsDraft).toBe(1);
    expect(h.politicianCreate).not.toHaveBeenCalled();
    expect(h.mandateCreate).not.toHaveBeenCalled();
  });
});
