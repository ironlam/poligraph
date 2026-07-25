import { describe, it, expect, vi, beforeEach } from "vitest";

// Affaires v2, lot 1: proposal creation, idempotency, risk derivation and the
// normalized comparison that guards acceptance against false conflicts.

const h = vi.hoisted(() => ({
  db: {
    affair: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    affairUpdateProposal: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({ db: h.db }));

import { Prisma } from "@/generated/prisma";
import {
  computePayloadHash,
  deriveRiskLevel,
  detectDrift,
  EMPTY_VALUE,
  hashSourceContent,
  normalizeForCompare,
  proposeAffairUpdate,
  ProposalValidationError,
  validatePatch,
} from "@/services/affairs/proposals";

const db = h.db;

const EMPTY_AFFAIR = {
  id: "aff_1",
  slug: "affaire-test",
  publicId: "AF-000542",
  title: "Affaire de test",
  politician: { slug: "jean-testeur", fullName: "Jean Testeur" },
  status: "INSTRUCTION",
  verdictDate: null,
  court: null,
  sentence: null,
  prisonMonths: null,
  prisonSuspended: null,
  ineligibilityMonths: null,
  communityService: null,
  otherSentence: null,
  ecli: null,
  pourvoiNumber: null,
  caseNumbers: [],
};

const BASE_INPUT = {
  affairId: "aff_1",
  importer: "discover-affairs",
  importRunId: "run_1",
  source: "WIKIDATA" as const,
  sourceUrl: "https://www.wikidata.org/wiki/Q123",
  officialId: "Q123",
  sourceContentHash: "deadbeef",
  confidence: 95,
  rationale: "Rapprochement HIGH avec l'affaire existante.",
  extractorVersion: "wikidata-penalty-v2",
};

beforeEach(() => {
  vi.clearAllMocks();
  db.affair.findUnique.mockResolvedValue(EMPTY_AFFAIR);
  db.affair.findFirst.mockResolvedValue(null);
  db.affairUpdateProposal.findFirst.mockResolvedValue(null);
  db.affairUpdateProposal.create.mockImplementation(async () => ({ id: "prop_new" }));
  db.affairUpdateProposal.update.mockResolvedValue({});
  db.auditLog.create.mockResolvedValue({});
  db.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(db));
});

describe("normalizeForCompare", () => {
  it("aligne une Date et sa forme ISO issue du JSON", () => {
    const date = new Date("2026-05-13T00:00:00.000Z");
    expect(normalizeForCompare(date)).toBe(normalizeForCompare("2026-05-13T00:00:00.000Z"));
  });

  it("aligne un Decimal Prisma et sa forme numérique", () => {
    expect(normalizeForCompare(new Prisma.Decimal("1000.00"))).toBe(normalizeForCompare(1000));
  });

  it("ignore l'ordre des tableaux", () => {
    expect(normalizeForCompare(["B", "A"])).toBe(normalizeForCompare(["A", "B"]));
  });

  it('distingue null de la chaîne "null" et de false', () => {
    const nul = normalizeForCompare(null);
    expect(nul).not.toBe(normalizeForCompare("null"));
    expect(nul).not.toBe(normalizeForCompare(false));
    expect(normalizeForCompare(undefined)).toBe(nul);
  });
});

describe("deriveRiskLevel", () => {
  it("HIGH dès qu'on touche au statut, même sur un champ vide", () => {
    // status is the only judicial-state field proposable in lot 1; involvement,
    // category and severity are out of the whitelist entirely.
    expect(deriveRiskLevel(["status"], { status: null })).toBe("HIGH");
  });

  it("HIGH quand on écrase une valeur existante", () => {
    expect(deriveRiskLevel(["court"], { court: "TJ de Paris" })).toBe("HIGH");
  });

  it("MEDIUM quand on remplit un champ judiciaire vide", () => {
    expect(deriveRiskLevel(["verdictDate", "court"], { verdictDate: null, court: null })).toBe(
      "MEDIUM"
    );
  });

  it("LOW quand seuls des identifiants machine vides sont remplis", () => {
    expect(deriveRiskLevel(["ecli", "pourvoiNumber"], { ecli: null, pourvoiNumber: null })).toBe(
      "LOW"
    );
  });
});

describe("detectDrift", () => {
  it("ne signale rien quand seule la représentation diffère", () => {
    const observed = { verdictDate: "2026-05-13T00:00:00.000Z", fineAmount: "1000" };
    const live = { verdictDate: new Date("2026-05-13T00:00:00.000Z"), fineAmount: 1000 };
    expect(detectDrift(observed, live)).toBeNull();
  });

  it("signale le champ qui a bougé, avec l'attendu et le trouvé", () => {
    const drift = detectDrift({ court: null }, { court: "TJ de Lyon" });
    expect(drift).toEqual({ court: { expected: EMPTY_VALUE, actual: "TJ de Lyon" } });
  });

  it("le marqueur de valeur vide est stockable en JSONB (pas de NUL)", () => {
    // Postgres rejects \u0000 inside a JSON string, and conflictDetail is JSONB.
    expect(EMPTY_VALUE).not.toMatch(/[\u0000-\u001f]/);
    expect(JSON.parse(JSON.stringify({ v: EMPTY_VALUE })).v).toBe(EMPTY_VALUE);
  });
});

describe("computePayloadHash", () => {
  const base = {
    importer: "judilibre",
    extractorVersion: "judilibre-v1",
    source: "JUDILIBRE" as const,
    sourceUrl: "https://example.test/d/1",
    officialId: "ECLI:FR:CCASS:2026:X",
    proposedPatch: { status: "CONDAMNATION_DEFINITIVE" },
    observedValues: { status: "APPEL_EN_COURS" },
  };

  it("est stable quel que soit l'ordre des clés", () => {
    const a = computePayloadHash({
      ...base,
      proposedPatch: { status: "X", court: "Y" },
      observedValues: { status: "A", court: "B" },
    });
    const b = computePayloedHashReordered();
    expect(a).toBe(b);

    function computePayloedHashReordered() {
      return computePayloadHash({
        ...base,
        proposedPatch: { court: "Y", status: "X" },
        observedValues: { court: "B", status: "A" },
      });
    }
  });

  it("change quand observedValues change, pour qu'un CONFLICT redevienne proposable", () => {
    const after = computePayloadHash({ ...base, observedValues: { status: "PROCES_EN_COURS" } });
    expect(after).not.toBe(computePayloadHash(base));
  });

  it("change quand extractorVersion change, pour qu'un extracteur corrigé repropose", () => {
    const after = computePayloadHash({ ...base, extractorVersion: "judilibre-v2" });
    expect(after).not.toBe(computePayloadHash(base));
  });

  it("change quand la source change, pour ne pas fusionner deux décisions distinctes", () => {
    const after = computePayloadHash({ ...base, officialId: "ECLI:FR:CCASS:2026:Y" });
    expect(after).not.toBe(computePayloadHash(base));
  });

  it("change quand le contenu de la source change à URL et identifiant constants", () => {
    // The case URL and the ECLI are stable, but the page was corrected.
    const before = computePayloadHash({ ...base, sourceContentHash: "hash-v1" });
    const after = computePayloadHash({ ...base, sourceContentHash: "hash-v2" });
    expect(after).not.toBe(before);
    // And an absent hash is not the same as any hash.
    expect(before).not.toBe(computePayloadHash(base));
  });

  it("insensible à la forme Date ou ISO d'une même valeur", () => {
    const withDate = computePayloadHash({
      ...base,
      proposedPatch: { verdictDate: new Date("2026-05-13T00:00:00.000Z") },
      observedValues: { verdictDate: null },
    });
    const withIso = computePayloadHash({
      ...base,
      proposedPatch: { verdictDate: "2026-05-13T00:00:00.000Z" },
      observedValues: { verdictDate: null },
    });
    expect(withDate).toBe(withIso);
  });
});

describe("hashSourceContent", () => {
  it("stable quel que soit l'ordre des clés, sensible au contenu", () => {
    expect(hashSourceContent({ a: 1, b: 2 })).toBe(hashSourceContent({ b: 2, a: 1 }));
    expect(hashSourceContent({ solution: "cassation" })).not.toBe(
      hashSourceContent({ solution: "rejet" })
    );
  });
});

describe("validatePatch", () => {
  it("refuse une clé hors whitelist", () => {
    expect(() => validatePatch({ publicationStatus: "PUBLISHED" })).toThrow(
      ProposalValidationError
    );
    expect(() => validatePatch({ politicianId: "pol_2" })).toThrow(ProposalValidationError);
    expect(() => validatePatch({ slug: "autre-slug" })).toThrow(ProposalValidationError);
  });

  it("refuse les champs que le lot 1 ne rend pas encore proposables", () => {
    // Nothing emits these yet, so nothing may apply them.
    for (const patch of [
      { involvement: "MENTIONED_ONLY" },
      { category: "PROBITE" },
      { severity: "GRAVE" },
      { title: "Autre titre" },
      { description: "Autre description" },
      { factsDate: "2020-01-01" },
      { startDate: "2020-01-01" },
      { chamber: "11e chambre" },
      { caseNumber: "2023/12345" },
    ]) {
      expect(() => validatePatch(patch), JSON.stringify(patch)).toThrow(ProposalValidationError);
    }
  });

  it("accepte les 13 champs de la whitelist du lot 1", () => {
    expect(() =>
      validatePatch({
        status: "CONDAMNATION_DEFINITIVE",
        verdictDate: "2026-05-13",
        court: "Cour de cassation",
        sentence: "2 ans avec sursis",
        prisonMonths: 24,
        prisonSuspended: true,
        fineAmount: "1500.50",
        ineligibilityMonths: 60,
        communityService: 100,
        otherSentence: "interdiction d'exercer",
        ecli: "ECLI:FR:CCASS:2026:X",
        pourvoiNumber: "23-80.000",
        caseNumbers: ["A", "B"],
      })
    ).not.toThrow();
  });

  it("coerce fineAmount en Decimal, sans passer par un flottant", () => {
    const patch = validatePatch({ fineAmount: "1500.50" });
    expect(Prisma.Decimal.isDecimal(patch.fineAmount)).toBe(true);
    expect(patch.fineAmount?.toFixed(2)).toBe("1500.50");
    expect(() => validatePatch({ fineAmount: -5 })).toThrow(ProposalValidationError);
  });

  it("refuse un patch vide", () => {
    expect(() => validatePatch({})).toThrow(ProposalValidationError);
  });

  it("refuse un statut inexistant et accepte les vraies valeurs de l'enum", () => {
    expect(() => validatePatch({ status: "PROCES" })).toThrow(ProposalValidationError);
    expect(validatePatch({ status: "PROCES_EN_COURS" }).status).toBe("PROCES_EN_COURS");
    expect(validatePatch({ status: "APPEL_EN_COURS" }).status).toBe("APPEL_EN_COURS");
  });

  it("coerce une date ISO en Date", () => {
    const patch = validatePatch({ verdictDate: "2026-05-13" });
    expect(patch.verdictDate).toBeInstanceOf(Date);
  });

  it("refuse une date invalide et une durée aberrante", () => {
    expect(() => validatePatch({ verdictDate: "pas-une-date" })).toThrow(ProposalValidationError);
    expect(() => validatePatch({ prisonMonths: 99999 })).toThrow(ProposalValidationError);
  });
});

describe("proposeAffairUpdate", () => {
  it("auto-applique un ECLI absent et libre, sans revue", async () => {
    const result = await proposeAffairUpdate({
      ...BASE_INPUT,
      source: "JUDILIBRE",
      patch: { ecli: "ECLI:FR:CCASS:2026:X" },
    });

    expect(result.autoApplied).toEqual(["ecli"]);
    expect(result.pendingProposalId).toBeNull();
    expect(db.affair.update).toHaveBeenCalledTimes(1);
    expect(db.affair.update.mock.calls[0]![0].data).toEqual({ ecli: "ECLI:FR:CCASS:2026:X" });
    expect(db.affairUpdateProposal.create.mock.calls[0]![0].data.status).toBe("AUTO_APPLIED");
    // The automated write still leaves a trace.
    expect(db.auditLog.create).toHaveBeenCalledTimes(1);
    // Proposal row, affair write and audit entry share one transaction.
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });

  it("l'auto-application revérifie l'éligibilité DANS la transaction", async () => {
    // Field was empty at classification time, filled in by the time we write.
    db.affair.findUnique
      .mockResolvedValueOnce(EMPTY_AFFAIR)
      .mockResolvedValueOnce({ ...EMPTY_AFFAIR, ecli: "ECLI:FR:CCASS:2020:OTHER" });

    const result = await proposeAffairUpdate({
      ...BASE_INPUT,
      source: "JUDILIBRE",
      patch: { ecli: "ECLI:FR:CCASS:2026:X" },
    });

    expect(result.autoApplied).toEqual([]);
    expect(result.conflictProposalId).toBe("prop_new");
    expect(db.affair.update).not.toHaveBeenCalled();
    const created = db.affairUpdateProposal.create.mock.calls[0]![0].data;
    expect(created.status).toBe("CONFLICT");
    expect(created.conflictDetail).toEqual({
      ecli: { expected: EMPTY_VALUE, actual: "ECLI:FR:CCASS:2020:OTHER" },
    });
  });

  it("enregistre un affairSnapshot pour survivre à la suppression de l'affaire", async () => {
    await proposeAffairUpdate({ ...BASE_INPUT, patch: { verdictDate: "2026-05-13" } });

    const created = db.affairUpdateProposal.create.mock.calls[0]![0].data;
    expect(created.affairSnapshot).toEqual({
      publicId: "AF-000542",
      slug: "affaire-test",
      title: "Affaire de test",
      politicianSlug: "jean-testeur",
      politicianName: "Jean Testeur",
    });
  });

  it("passe en CONFLICT quand l'ECLI appartient déjà à une autre affaire", async () => {
    db.affair.findFirst.mockResolvedValue({ id: "aff_other" });

    const result = await proposeAffairUpdate({
      ...BASE_INPUT,
      source: "JUDILIBRE",
      patch: { ecli: "ECLI:FR:CCASS:2026:X" },
    });

    expect(result.conflictProposalId).toBe("prop_new");
    expect(result.autoApplied).toEqual([]);
    // No blind write, so no P2002 on the unique index.
    expect(db.affair.update).not.toHaveBeenCalled();
    expect(db.affairUpdateProposal.create.mock.calls[0]![0].data.status).toBe("CONFLICT");
  });

  it("met un ECLI contradictoire en revue au lieu de l'écraser", async () => {
    db.affair.findUnique.mockResolvedValue({ ...EMPTY_AFFAIR, ecli: "ECLI:FR:CCASS:2020:OLD" });

    const result = await proposeAffairUpdate({
      ...BASE_INPUT,
      source: "JUDILIBRE",
      patch: { ecli: "ECLI:FR:CCASS:2026:NEW" },
    });

    expect(result.autoApplied).toEqual([]);
    expect(result.pendingProposalId).toBe("prop_new");
    expect(db.affair.update).not.toHaveBeenCalled();
    const created = db.affairUpdateProposal.create.mock.calls[0]![0].data;
    expect(created.status).toBe("PENDING");
    expect(created.riskLevel).toBe("HIGH");
  });

  it("n'auto-applique jamais un statut ou une peine", async () => {
    const result = await proposeAffairUpdate({
      ...BASE_INPUT,
      patch: { status: "CONDAMNATION_DEFINITIVE", prisonMonths: 24, verdictDate: "2026-05-13" },
    });

    expect(result.autoApplied).toEqual([]);
    expect(result.pendingProposalId).toBe("prop_new");
    expect(db.affair.update).not.toHaveBeenCalled();
    const created = db.affairUpdateProposal.create.mock.calls[0]![0].data;
    expect(Object.keys(created.proposedPatch).sort()).toEqual([
      "prisonMonths",
      "status",
      "verdictDate",
    ]);
    expect(created.riskLevel).toBe("HIGH");
  });

  it("n'ajoute que les numéros de dossier absents, et rien si tout est déjà là", async () => {
    db.affair.findUnique.mockResolvedValue({ ...EMPTY_AFFAIR, caseNumbers: ["A", "B"] });

    const nothingNew = await proposeAffairUpdate({
      ...BASE_INPUT,
      source: "JUDILIBRE",
      patch: { caseNumbers: ["A", "B"] },
    });
    expect(nothingNew.autoApplied).toEqual([]);
    expect(db.affair.update).not.toHaveBeenCalled();

    const withNew = await proposeAffairUpdate({
      ...BASE_INPUT,
      source: "JUDILIBRE",
      patch: { caseNumbers: ["B", "C"] },
    });
    expect(withNew.autoApplied).toEqual(["caseNumbers"]);
    expect(db.affair.update.mock.calls[0]![0].data.caseNumbers.sort()).toEqual(["A", "B", "C"]);
  });

  it("idempotence : un patch déjà enregistré ne crée pas de doublon", async () => {
    db.affairUpdateProposal.findFirst.mockResolvedValue({ id: "prop_old", status: "PENDING" });

    const result = await proposeAffairUpdate({
      ...BASE_INPUT,
      patch: { status: "CONDAMNATION_DEFINITIVE" },
    });

    expect(result.deduped).toBe(true);
    expect(result.pendingProposalId).toBe("prop_old");
    expect(db.affairUpdateProposal.create).not.toHaveBeenCalled();
  });

  it("un patch rejeté n'est jamais ressuscité par un run suivant", async () => {
    db.affairUpdateProposal.findFirst.mockResolvedValue({ id: "prop_old", status: "REJECTED" });

    const result = await proposeAffairUpdate({
      ...BASE_INPUT,
      patch: { status: "CONDAMNATION_DEFINITIVE" },
    });

    expect(result.deduped).toBe(true);
    expect(db.affairUpdateProposal.create).not.toHaveBeenCalled();
    // Not even a touch: the row keeps its terminal state.
    expect(db.affairUpdateProposal.update).not.toHaveBeenCalled();
  });

  it("sépare l'auto-applicable de ce qui doit être revu, en une passe", async () => {
    const result = await proposeAffairUpdate({
      ...BASE_INPUT,
      source: "JUDILIBRE",
      patch: { ecli: "ECLI:FR:CCASS:2026:X", status: "CONDAMNATION_DEFINITIVE" },
    });

    expect(result.autoApplied).toEqual(["ecli"]);
    expect(result.pendingProposalId).toBe("prop_new");
    expect(db.affair.update.mock.calls[0]![0].data).toEqual({ ecli: "ECLI:FR:CCASS:2026:X" });

    const statuses = db.affairUpdateProposal.create.mock.calls.map((c) => c[0].data.status);
    expect(statuses).toEqual(["AUTO_APPLIED", "PENDING"]);
  });

  it("refuse un patch invalide avant toute écriture", async () => {
    await expect(
      proposeAffairUpdate({ ...BASE_INPUT, patch: { publicationStatus: "PUBLISHED" } })
    ).rejects.toThrow(ProposalValidationError);

    expect(db.affair.findUnique).not.toHaveBeenCalled();
    expect(db.affair.update).not.toHaveBeenCalled();
    expect(db.affairUpdateProposal.create).not.toHaveBeenCalled();
  });
});
