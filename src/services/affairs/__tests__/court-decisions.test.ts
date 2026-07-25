import { describe, it, expect, vi, beforeEach } from "vitest";

// Issue #536 — the court decision service. Mocked client: this repository's local
// `.env` points at production, so a test that inserts rows would insert them there.

const h = vi.hoisted(() => ({
  create: vi.fn(),
  findUnique: vi.fn(),
  findMany: vi.fn(),
  linkFindUnique: vi.fn(),
  linkCreate: vi.fn(),
  linkDeleteMany: vi.fn(),
  linkFindMany: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    courtDecision: { create: h.create, findUnique: h.findUnique, findMany: h.findMany },
    affairCourtDecision: {
      findUnique: h.linkFindUnique,
      create: h.linkCreate,
      deleteMany: h.linkDeleteMany,
      findMany: h.linkFindMany,
    },
  },
}));

import {
  createCourtDecision,
  findCourtDecisionByEcli,
  findCourtDecisionByJudilibreId,
  findCourtDecisionsByPourvoiNumber,
  linkAffairToCourtDecision,
  listCourtDecisionsForAffair,
  normalizePourvoiNumber,
  unlinkAffairFromCourtDecision,
} from "../court-decisions";

beforeEach(() => {
  vi.clearAllMocks();
  h.create.mockResolvedValue({ id: "dec_1" });
  h.linkCreate.mockResolvedValue({});
  h.linkFindUnique.mockResolvedValue(null);
  h.linkDeleteMany.mockResolvedValue({ count: 1 });
  h.linkFindMany.mockResolvedValue([]);
  h.findMany.mockResolvedValue([]);
});

describe("normalizePourvoiNumber — issue #536", () => {
  it("retire les séparateurs du format publié", () => {
    expect(normalizePourvoiNumber("96-83.698")).toBe("9683698");
  });

  it("rapproche deux écritures de la même référence", () => {
    expect(normalizePourvoiNumber("96-83698")).toBe(normalizePourvoiNumber("96-83.698"));
    expect(normalizePourvoiNumber(" 96 83 698 ")).toBe("9683698");
  });

  it("replie les accents et la casse", () => {
    expect(normalizePourvoiNumber("A96-83.698")).toBe("a9683698");
    expect(normalizePourvoiNumber("Ç12-34.567")).toBe("c1234567");
  });

  it("ne perd aucun chiffre", () => {
    expect(normalizePourvoiNumber("21-12.345")).toBe("2112345");
    expect(normalizePourvoiNumber("97-81.102")).toBe("9781102");
  });
});

describe("createCourtDecision — issue #536", () => {
  it("dérive la forme normalisée, jamais fournie par l'appelant", () => {
    return createCourtDecision({ pourvoiNumber: "96-83.698" }).then(() => {
      expect(h.create.mock.calls[0]![0].data).toMatchObject({
        pourvoiNumber: "96-83.698",
        pourvoiNumberNormalized: "9683698",
      });
    });
  });

  it("laisse la forme normalisée nulle sans pourvoi", async () => {
    await createCourtDecision({ ecli: "ECLI:FR:CCASS:2024:C100001" });

    expect(h.create.mock.calls[0]![0].data).toMatchObject({
      pourvoiNumber: null,
      pourvoiNumberNormalized: null,
    });
  });

  it("laisse juridiction, date et sens nuls quand ils ne sont pas fournis", async () => {
    // Ces champs ne viennent que d'une source officielle : 23,7 % des Affair.court
    // désignent un organe qui ne rend aucune décision.
    await createCourtDecision({ pourvoiNumber: "96-83.698" });

    expect(h.create.mock.calls[0]![0].data).toMatchObject({
      court: null,
      chamber: null,
      decisionDate: null,
      solution: null,
    });
  });
});

describe("Identités réutilisables — issue #536", () => {
  it("cherche par ECLI en unicité", async () => {
    h.findUnique.mockResolvedValue({ id: "dec_1" });

    await findCourtDecisionByEcli("ECLI:FR:CCASS:2024:C100001");

    expect(h.findUnique).toHaveBeenCalledWith({
      where: { ecli: "ECLI:FR:CCASS:2024:C100001" },
    });
  });

  it("cherche par identifiant Judilibre en unicité", async () => {
    await findCourtDecisionByJudilibreId("jud_1");

    expect(h.findUnique).toHaveBeenCalledWith({ where: { judilibreId: "jud_1" } });
  });

  it("rend une LISTE pour un pourvoi, parce qu'il n'est pas unique", async () => {
    h.findMany.mockResolvedValue([{ id: "dec_1" }, { id: "dec_2" }]);

    const found = await findCourtDecisionsByPourvoiNumber("96-83.698");

    // Deux décisions peuvent partager un pourvoi (rejet, cassation partielle,
    // renvoi) : l'appelant doit trancher, le service ne devine pas.
    expect(found).toHaveLength(2);
    expect(h.findMany).toHaveBeenCalledWith({
      where: { pourvoiNumberNormalized: "9683698" },
    });
  });

  it("n'expose aucun upsert par pourvoi", async () => {
    const mod = await import("../court-decisions");

    expect(mod).not.toHaveProperty("upsertByPourvoiNumber");
    expect(Object.keys(mod).filter((k) => /upsert/i.test(k))).toEqual([]);
  });
});

describe("Liaisons — issue #536", () => {
  it("crée une liaison absente", async () => {
    const result = await linkAffairToCourtDecision({ affairId: "a1", courtDecisionId: "dec_1" });

    expect(result.created).toBe(true);
    expect(h.linkCreate).toHaveBeenCalledWith({
      data: { affairId: "a1", courtDecisionId: "dec_1", notes: null },
    });
  });

  it("est idempotente : relier deux fois ne lève pas d'erreur", async () => {
    h.linkFindUnique.mockResolvedValue({ affairId: "a1" });

    const result = await linkAffairToCourtDecision({ affairId: "a1", courtDecisionId: "dec_1" });

    expect(result.created).toBe(false);
    expect(h.linkCreate).not.toHaveBeenCalled();
  });

  it("permet à une décision de porter deux affaires", async () => {
    await linkAffairToCourtDecision({ affairId: "a1", courtDecisionId: "dec_1" });
    await linkAffairToCourtDecision({ affairId: "a2", courtDecisionId: "dec_1" });

    expect(h.linkCreate).toHaveBeenCalledTimes(2);
    const affairs = h.linkCreate.mock.calls.map((c) => c[0].data.affairId);
    expect(affairs).toEqual(["a1", "a2"]);
  });

  it("délie sans jamais supprimer la décision", async () => {
    const result = await unlinkAffairFromCourtDecision({
      affairId: "a1",
      courtDecisionId: "dec_1",
    });

    expect(result.deleted).toBe(true);
    expect(h.linkDeleteMany).toHaveBeenCalledWith({
      where: { affairId: "a1", courtDecisionId: "dec_1" },
    });
    // Aucune suppression sur la table des décisions.
    expect(h.create).not.toHaveBeenCalled();
  });

  it("liste les décisions d'une affaire avec la note de liaison", async () => {
    h.linkFindMany.mockResolvedValue([
      { notes: "deux chefs", courtDecision: { id: "dec_1", pourvoiNumber: "96-83.698" } },
    ]);

    const decisions = await listCourtDecisionsForAffair("a1");

    expect(decisions).toEqual([
      { id: "dec_1", pourvoiNumber: "96-83.698", linkNotes: "deux chefs" },
    ]);
  });
});
