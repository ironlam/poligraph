import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  resolveUrl: vi.fn(),
  getText: vi.fn(),
  mandateFindFirst: vi.fn(),
  mandateUpdate: vi.fn(),
  mandateCreate: vi.fn(),
  politicianFindMany: vi.fn(),
  politicianFindUnique: vi.fn(),
  politicianCreate: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    mandate: {
      findFirst: h.mandateFindFirst,
      update: h.mandateUpdate,
      create: h.mandateCreate,
    },
    politician: {
      findMany: h.politicianFindMany,
      findUnique: h.politicianFindUnique,
      create: h.politicianCreate,
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
  vi.clearAllMocks();
  h.resolveUrl.mockResolvedValue("https://example.test/ca.csv");
  h.getText.mockResolvedValue({ data: CSV });
  h.mandateFindFirst.mockResolvedValue(null);
  h.politicianFindMany.mockResolvedValue([]);
  h.politicianFindUnique.mockResolvedValue(null);
  h.politicianCreate.mockResolvedValue({ id: "new" });
  h.mandateCreate.mockResolvedValue({ id: "m1" });
  h.mandateUpdate.mockResolvedValue({ id: "old" });
});

describe("alternance de maire d'arrondissement", () => {
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

  it("clôt le prédécesseur et ouvre le successeur", async () => {
    // Tester la seule existence du secteur rendait la passe non rejouable :
    // un successeur nommé dans un export ultérieur restait ignoré.
    h.mandateFindFirst.mockResolvedValue({
      id: "old",
      politician: { firstName: "Benoît", lastName: "DUPONT" },
    });

    const stats = await syncArrondissementMayors();

    expect(stats.succeeded).toBe(1);
    expect(h.mandateUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "old" },
        data: expect.objectContaining({ isCurrent: false }),
      })
    );
    expect(h.politicianCreate).toHaveBeenCalledTimes(1);
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
