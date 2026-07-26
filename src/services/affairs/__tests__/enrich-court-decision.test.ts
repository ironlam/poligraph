import { describe, it, expect, vi, beforeEach } from "vitest";

// Issue #337 — targeted enrichment. The tests that matter most are the ones where
// the service must REFUSE to write: ambiguous pourvoi, contradictory identity, and
// a response whose nulls must not erase what is already stored.

const h = vi.hoisted(() => ({
  findUnique: vi.fn(),
  txFindUnique: vi.fn(),
  update: vi.fn(),
  auditCreate: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    courtDecision: { findUnique: h.findUnique },
    $transaction: h.transaction,
  },
}));

vi.mock("@/lib/api/judilibre", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/judilibre")>()),
  createJudilibreClient: () => null,
}));

import { enrichCourtDecisionFromJudilibre, type JudilibreReader } from "../enrich-court-decision";
import type { JudilibreDecision } from "@/lib/api/judilibre";
import { hashJudilibrePayload } from "../judilibre-court-decision";

const TAXONOMY: Record<string, Record<string, string>> = {
  jurisdiction: { cc: "Cour de cassation" },
  chamber: { cr: "Chambre criminelle" },
  solution: { rejet: "Rejet" },
  type: { arret: "Arrêt" },
};

function record(overrides: Partial<JudilibreDecision> = {}): JudilibreDecision {
  return {
    id: "jud_1",
    number: "96-83.698",
    numbers: ["96-83.698"],
    decision_date: "1997-10-27",
    jurisdiction: "cc",
    chamber: "cr",
    solution: "rejet",
    type: "arret",
    themes: [],
    summary: "",
    text: "corps",
    ...overrides,
  } as JudilibreDecision;
}

function reader(overrides: Partial<JudilibreReader> = {}): JudilibreReader {
  return {
    getDecision: vi.fn().mockResolvedValue(record()),
    findDecisionByEcli: vi.fn().mockResolvedValue({ id: "jud_1" }),
    findDecisionsByPourvoiNumber: vi.fn().mockResolvedValue([{ id: "jud_1" }]),
    getTaxonomy: vi.fn().mockImplementation(async (id: string) => TAXONOMY[id] ?? {}),
    ...overrides,
  };
}

/** A stored row, before enrichment. */
function stored(overrides: Record<string, unknown> = {}) {
  return {
    id: "dec_1",
    judilibreId: null,
    ecli: null,
    pourvoiNumber: "96-83.698",
    pourvoiNumberNormalized: "9683698",
    decisionDate: null,
    court: null,
    chamber: null,
    solution: null,
    sourceUrl: null,
    metadata: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.findUnique.mockResolvedValue(stored());
  h.txFindUnique.mockResolvedValue(stored());
  h.update.mockResolvedValue({});
  h.auditCreate.mockResolvedValue({});
  h.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn({
      courtDecision: { findUnique: h.txFindUnique, update: h.update },
      auditLog: { create: h.auditCreate },
    })
  );
});

describe("Résolution de la référence (#337)", () => {
  it("écrit les champs officiels depuis un pourvoi résolu", async () => {
    const result = await enrichCourtDecisionFromJudilibre(
      { courtDecisionId: "dec_1", pourvoiNumber: "96-83.698" },
      reader()
    );

    expect(result.status).toBe("UPDATED");
    expect(h.update.mock.calls[0]![0].data).toMatchObject({
      judilibreId: "jud_1",
      court: "Cour de cassation",
      chamber: "Chambre criminelle",
      solution: "Rejet",
      sourceUrl: "https://www.courdecassation.fr/decision/jud_1",
    });
  });

  it("préfère l'identifiant Judilibre à toute autre référence", async () => {
    const r = reader();
    await enrichCourtDecisionFromJudilibre(
      {
        courtDecisionId: "dec_1",
        judilibreId: "jud_1",
        ecli: "ECLI:X",
        pourvoiNumber: "96-83.698",
      },
      r
    );

    expect(r.findDecisionByEcli).not.toHaveBeenCalled();
    expect(r.findDecisionsByPourvoiNumber).not.toHaveBeenCalled();
  });

  it("REFUSE d'écrire quand un pourvoi rend plusieurs décisions", async () => {
    const result = await enrichCourtDecisionFromJudilibre(
      { courtDecisionId: "dec_1", pourvoiNumber: "96-83.698" },
      reader({
        findDecisionsByPourvoiNumber: vi.fn().mockResolvedValue([{ id: "jud_1" }, { id: "jud_2" }]),
      })
    );

    // Un pourvoi peut produire rejet, cassation partielle et renvoi : choisir serait deviner.
    expect(result).toMatchObject({ status: "AMBIGUOUS", candidates: ["jud_1", "jud_2"] });
    expect(h.update).not.toHaveBeenCalled();
    expect(h.auditCreate).not.toHaveBeenCalled();
  });

  it("rend NOT_FOUND sans écrire quand la référence ne résout pas", async () => {
    const result = await enrichCourtDecisionFromJudilibre(
      { courtDecisionId: "dec_1", pourvoiNumber: "00-00.000" },
      reader({ findDecisionsByPourvoiNumber: vi.fn().mockResolvedValue([]) })
    );

    expect(result.status).toBe("NOT_FOUND");
    expect(h.update).not.toHaveBeenCalled();
  });

  it("refuse une demande sans aucune référence", async () => {
    const result = await enrichCourtDecisionFromJudilibre({ courtDecisionId: "dec_1" }, reader());

    expect(result.status).toBe("NO_REFERENCE");
    expect(h.update).not.toHaveBeenCalled();
  });

  it("rend UNAVAILABLE sans client configuré", async () => {
    const result = await enrichCourtDecisionFromJudilibre({
      courtDecisionId: "dec_1",
      judilibreId: "jud_1",
    });

    expect(result.status).toBe("UNAVAILABLE");
  });
});

describe("Vérification d'identité (#337)", () => {
  it("REFUSE une réponse portant un autre identifiant que celui demandé", async () => {
    const result = await enrichCourtDecisionFromJudilibre(
      { courtDecisionId: "dec_1", judilibreId: "jud_1" },
      reader({ getDecision: vi.fn().mockResolvedValue(record({ id: "jud_autre" })) })
    );

    expect(result.status).toBe("CONFLICT");
    expect(h.update).not.toHaveBeenCalled();
  });

  it("REFUSE d'enrichir une décision déjà rattachée à un autre identifiant", async () => {
    h.findUnique.mockResolvedValue(stored({ judilibreId: "jud_deja_la" }));
    h.txFindUnique.mockResolvedValue(stored({ judilibreId: "jud_deja_la" }));

    const result = await enrichCourtDecisionFromJudilibre(
      { courtDecisionId: "dec_1", judilibreId: "jud_1" },
      reader()
    );

    // Sinon on réécrirait en silence quelle décision une fiche publiée cite.
    expect(result).toMatchObject({ status: "CONFLICT" });
    expect(h.update).not.toHaveBeenCalled();
  });

  it("REFUSE quand l'ECLI stocké contredit celui de la réponse", async () => {
    h.findUnique.mockResolvedValue(stored({ ecli: "ECLI:FR:CCASS:2026:CR00001" }));
    h.txFindUnique.mockResolvedValue(stored({ ecli: "ECLI:FR:CCASS:2026:CR00001" }));

    const result = await enrichCourtDecisionFromJudilibre(
      { courtDecisionId: "dec_1", judilibreId: "jud_1" },
      reader({
        getDecision: vi.fn().mockResolvedValue(record({ ecli: "ECLI:FR:CCASS:2026:CR99999" })),
      })
    );

    expect(result.status).toBe("CONFLICT");
    expect(h.update).not.toHaveBeenCalled();
  });

  it("REFUSE une réponse ne portant pas le pourvoi demandé", async () => {
    const result = await enrichCourtDecisionFromJudilibre(
      { courtDecisionId: "dec_1", pourvoiNumber: "96-83.698" },
      reader({
        getDecision: vi
          .fn()
          .mockResolvedValue(record({ number: "12-34.567", numbers: ["12-34.567"] })),
      })
    );

    expect(result.status).toBe("CONFLICT");
    expect(h.update).not.toHaveBeenCalled();
  });

  it("accepte un pourvoi porté par la liste secondaire", async () => {
    const result = await enrichCourtDecisionFromJudilibre(
      { courtDecisionId: "dec_1", pourvoiNumber: "96-83.698" },
      reader({
        getDecision: vi
          .fn()
          .mockResolvedValue(record({ number: "97-81.102", numbers: ["97-81.102", "96-83.698"] })),
      })
    );

    expect(result.status).toBe("UPDATED");
  });

  it("REFUSE quand la décision a disparu entre la lecture et la transaction", async () => {
    h.txFindUnique.mockResolvedValue(null);

    const result = await enrichCourtDecisionFromJudilibre(
      { courtDecisionId: "dec_1", judilibreId: "jud_1" },
      reader()
    );

    expect(result.status).toBe("CONFLICT");
    expect(h.update).not.toHaveBeenCalled();
  });
});

describe("Écriture et audit (#337)", () => {
  it("un null de la réponse n'efface pas une valeur déjà enregistrée", async () => {
    h.findUnique.mockResolvedValue(stored({ solution: "Rejet", court: "Cour de cassation" }));
    h.txFindUnique.mockResolvedValue(stored({ solution: "Rejet", court: "Cour de cassation" }));

    await enrichCourtDecisionFromJudilibre(
      { courtDecisionId: "dec_1", judilibreId: "jud_1" },
      // Codes inconnus de la taxonomie → le mappeur rend null.
      reader({
        getDecision: vi.fn().mockResolvedValue(record({ solution: "inconnu", jurisdiction: "xx" })),
      })
    );

    const written = h.update.mock.calls[0]![0].data;
    // L'API qui omet un champ ne dit pas que le champ est vide.
    expect(written).not.toHaveProperty("solution");
    expect(written).not.toHaveProperty("court");
  });

  it("applique une valeur officielle différente et garde le diff en audit", async () => {
    h.findUnique.mockResolvedValue(stored({ solution: "Cassation" }));
    h.txFindUnique.mockResolvedValue(stored({ solution: "Cassation" }));

    const result = await enrichCourtDecisionFromJudilibre(
      { courtDecisionId: "dec_1", judilibreId: "jud_1" },
      reader()
    );

    expect(result).toMatchObject({ status: "UPDATED" });
    expect(h.update.mock.calls[0]![0].data.solution).toBe("Rejet");
    const audited = h.auditCreate.mock.calls[0]![0].data.changes.changes;
    expect(audited).toContainEqual({ field: "solution", before: "Cassation", after: "Rejet" });
  });

  it("écrit la provenance complète dans l'audit", async () => {
    await enrichCourtDecisionFromJudilibre(
      {
        courtDecisionId: "dec_1",
        pourvoiNumber: "96-83.698",
        triggeredBy: "admin",
        requestMeta: { ip: "203.0.113.7", userAgent: "navigateur" },
      },
      reader()
    );

    const entry = h.auditCreate.mock.calls[0]![0].data;
    expect(entry).toMatchObject({
      entityType: "CourtDecision",
      entityId: "dec_1",
      ipAddress: "203.0.113.7",
      userAgent: "navigateur",
    });
    expect(entry.changes).toMatchObject({
      action: "JUDILIBRE_ENRICHMENT",
      // Le canal, pas l'outil : une seule session admin existe, sans identifiant par personne.
      triggeredBy: "admin",
      reference: "pourvoi:96-83.698",
      judilibreId: "jud_1",
      mapperVersion: expect.any(String),
    });
    expect(entry.changes.sourceContentHash).toHaveLength(64);
    expect(entry.changes.retrievedAt).toEqual(expect.any(String));
  });

  it("audit et écriture vivent dans la même transaction", async () => {
    await enrichCourtDecisionFromJudilibre(
      { courtDecisionId: "dec_1", judilibreId: "jud_1" },
      reader()
    );

    expect(h.transaction).toHaveBeenCalledTimes(1);
    expect(h.update).toHaveBeenCalledTimes(1);
    expect(h.auditCreate).toHaveBeenCalledTimes(1);
  });

  it("ne touche ni affaire, ni liaison, ni proposition", async () => {
    const tx: Record<string, unknown> = {
      courtDecision: { findUnique: h.txFindUnique, update: h.update },
      auditLog: { create: h.auditCreate },
    };
    h.transaction.mockImplementation(async (fn: (t: unknown) => unknown) => fn(tx));

    await enrichCourtDecisionFromJudilibre(
      { courtDecisionId: "dec_1", judilibreId: "jud_1" },
      reader()
    );

    // Le client transactionnel n'expose rien d'autre : toucher une affaire lèverait.
    expect(Object.keys(tx)).toEqual(["courtDecision", "auditLog"]);
  });
});

describe("Idempotence (#337)", () => {
  it("rejouer la même réponse n'écrit rien et ne crée aucun audit", async () => {
    const same = record();
    const enriched = stored({
      judilibreId: "jud_1",
      pourvoiNumber: "96-83.698",
      pourvoiNumberNormalized: "9683698",
      decisionDate: new Date("1997-10-27T00:00:00Z"),
      court: "Cour de cassation",
      chamber: "Chambre criminelle",
      solution: "Rejet",
      sourceUrl: "https://www.courdecassation.fr/decision/jud_1",
      metadata: { sourceContentHash: hashJudilibrePayload(same) },
    });
    h.findUnique.mockResolvedValue(enriched);
    h.txFindUnique.mockResolvedValue(enriched);

    const result = await enrichCourtDecisionFromJudilibre(
      { courtDecisionId: "dec_1", judilibreId: "jud_1" },
      reader({ getDecision: vi.fn().mockResolvedValue(same) })
    );

    expect(result).toEqual({ status: "UNCHANGED", judilibreId: "jud_1" });
    expect(h.update).not.toHaveBeenCalled();
    expect(h.auditCreate).not.toHaveBeenCalled();
  });

  it("réécrit quand la charge officielle a changé, même à champs identiques", async () => {
    const enriched = stored({
      judilibreId: "jud_1",
      pourvoiNumber: "96-83.698",
      pourvoiNumberNormalized: "9683698",
      decisionDate: new Date("1997-10-27T00:00:00Z"),
      court: "Cour de cassation",
      chamber: "Chambre criminelle",
      solution: "Rejet",
      sourceUrl: "https://www.courdecassation.fr/decision/jud_1",
      metadata: { sourceContentHash: "un_hash_anterieur" },
    });
    h.findUnique.mockResolvedValue(enriched);
    h.txFindUnique.mockResolvedValue(enriched);

    const result = await enrichCourtDecisionFromJudilibre(
      { courtDecisionId: "dec_1", judilibreId: "jud_1" },
      reader()
    );

    // Une rectification du texte de la décision doit rester traçable.
    expect(result.status).toBe("UPDATED");
    expect(h.auditCreate).toHaveBeenCalledTimes(1);
  });
});
