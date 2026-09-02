import { describe, it, expect, vi, beforeEach } from "vitest";

// Affaires v2, lot 1: proposal creation, idempotency, risk derivation and the
// normalized comparison that guards acceptance against false conflicts.

const h = vi.hoisted(() => ({
  db: {
    affair: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    affairEvent: { findUnique: vi.fn(), findMany: vi.fn() },
    affairUpdateProposal: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({ db: h.db }));

import { Prisma } from "@/generated/prisma";
import {
  AFFAIR_EVOLUTION_REVELATION_TITLE,
  parseAffairProposalPayload,
} from "@/lib/security/schemas/affair-proposal";
import {
  computeAffairEventIdentity,
  computePayloadHash,
  deriveRiskLevel,
  detectDrift,
  EMPTY_VALUE,
  hashSourceContent,
  normalizeForCompare,
  previewAffairEventProposal,
  proposeAffairUpdate,
  proposeAffairEvent,
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
  publicationStatus: "PUBLISHED",
  verdictDate: null,
  court: null,
  sentence: null,
  prisonMonths: null,
  prisonFirmMonths: null,
  ineligibilityFirmMonths: null,
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
  db.affairEvent.findUnique.mockResolvedValue(null);
  db.affairEvent.findMany.mockResolvedValue([]);
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

  it("accepte les 11 champs de la whitelist", () => {
    expect(() =>
      validatePatch({
        status: "CONDAMNATION_DEFINITIVE",
        verdictDate: "2026-05-13",
        court: "Cour de cassation",
        sentence: "2 ans dont 1 an avec sursis",
        prisonMonths: 24,
        prisonFirmMonths: 12,
        fineAmount: "1500.50",
        ineligibilityMonths: 60,
        ineligibilityFirmMonths: 30,
        communityService: 100,
        otherSentence: "interdiction d'exercer",
      })
    ).not.toThrow();
  });

  it("refuse les identifiants de décision, partis sur CourtDecision (#545)", () => {
    for (const patch of [
      { ecli: "ECLI:FR:CCASS:2026:X" },
      { pourvoiNumber: "23-80.000" },
      { caseNumbers: ["A", "B"] },
      { chamber: "Chambre criminelle" },
    ]) {
      expect(() => validatePatch(patch)).toThrow(ProposalValidationError);
    }
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

describe("parseAffairProposalPayload", () => {
  const validEvent = {
    addEvent: {
      date: "2026-08-27T08:00:00.000Z",
      type: "REVELATION",
      title: AFFAIR_EVOLUTION_REVELATION_TITLE,
      description: null,
      sourceUrl: "https://example.test/article",
      sourceTitle: "Article source",
    },
  };

  it("préserve les patchs historiques et discrimine un ajout d’événement", () => {
    expect(parseAffairProposalPayload({ court: "TJ de Paris" }).kind).toBe("PATCH");
    expect(parseAffairProposalPayload(validEvent).kind).toBe("ADD_EVENT");
  });

  it("refuse un payload mixte, une date impossible et une URL dangereuse", () => {
    expect(() => parseAffairProposalPayload({ ...validEvent, court: "TJ de Paris" })).toThrow();
    expect(() =>
      parseAffairProposalPayload({
        addEvent: { ...validEvent.addEvent, date: "2026-02-30T08:00:00.000Z" },
      })
    ).toThrow();
    expect(() =>
      parseAffairProposalPayload({
        addEvent: { ...validEvent.addEvent, sourceUrl: "javascript:alert(1)" },
      })
    ).toThrow();
  });

  it("refuse le texte IA et les événements procéduraux dans ce lot", () => {
    expect(() =>
      parseAffairProposalPayload({
        addEvent: { ...validEvent.addEvent, title: "Titre produit par le modèle" },
      })
    ).toThrow();
    expect(() =>
      parseAffairProposalPayload({
        addEvent: { ...validEvent.addEvent, type: "MISE_EN_EXAMEN" },
      })
    ).toThrow();
  });
});

describe("proposeAffairUpdate", () => {
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

  it("n'écrit jamais sur l'affaire : tout part en revue", async () => {
    // Depuis #545 l'invariant est absolu, sans exception : un importeur ne mute
    // jamais une affaire existante, quel que soit le champ.
    const result = await proposeAffairUpdate({
      ...BASE_INPUT,
      patch: { status: "CONDAMNATION_DEFINITIVE", prisonMonths: 24, verdictDate: "2026-05-13" },
    });

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

  it("refuse un patch invalide avant toute écriture", async () => {
    await expect(
      proposeAffairUpdate({ ...BASE_INPUT, patch: { publicationStatus: "PUBLISHED" } })
    ).rejects.toThrow(ProposalValidationError);

    expect(db.affair.findUnique).not.toHaveBeenCalled();
    expect(db.affair.update).not.toHaveBeenCalled();
    expect(db.affairUpdateProposal.create).not.toHaveBeenCalled();
  });
});

describe("proposeAffairEvent", () => {
  const EVENT_INPUT = {
    affairId: "aff_1",
    importer: "press-analysis",
    importRunId: "run_press",
    sourceUrl: "https://www.lemonde.fr/politique/article-test.html#section",
    sourceTitle: "Un nouvel article documente l’affaire",
    publishedAt: new Date("2026-08-27T08:00:00.000Z"),
    publisher: "AFP",
    pressArticleId: "article_1",
    resolverDecisionId: "decision_1",
    sourceContentHash: "content-hash",
    sourceExcerpt: "Extrait vérifié dans le contenu.",
    confidence: 55,
    rationale: "Candidat d’évolution unique.",
    extractorVersion: "press-evolution-v1",
  };

  it("utilise uniquement PressArticle.id quand il est disponible", () => {
    const tracked = computeAffairEventIdentity({
      affairId: "aff_1",
      sourceUrl: "https://www.lemonde.fr/article.html?utm_source=rss#titre",
      publishedAt: EVENT_INPUT.publishedAt,
      pressArticleId: "article_1",
    });
    const canonical = computeAffairEventIdentity({
      affairId: "aff_1",
      sourceUrl: "https://www.lemonde.fr/article.html",
      publishedAt: EVENT_INPUT.publishedAt,
      pressArticleId: "article_1",
    });

    expect(tracked).toBe(canonical);
  });

  it("canonise les paramètres de tracking quand aucun PressArticle.id n’existe", () => {
    const tracked = computeAffairEventIdentity({
      affairId: "aff_1",
      sourceUrl: "https://www.lemonde.fr/article.html?utm_source=rss&b=2&a=1#titre",
      publishedAt: EVENT_INPUT.publishedAt,
    });
    const canonical = computeAffairEventIdentity({
      affairId: "aff_1",
      sourceUrl: "https://www.lemonde.fr/article.html?a=1&b=2",
      publishedAt: EVENT_INPUT.publishedAt,
    });

    expect(tracked).toBe(canonical);
  });

  it("distingue l’affaire cible et la date réelle de publication", () => {
    const base = computeAffairEventIdentity({
      affairId: "aff_1",
      sourceUrl: "https://www.lemonde.fr/article.html",
      publishedAt: new Date("2026-08-27T08:00:00.000Z"),
    });
    const otherAffair = computeAffairEventIdentity({
      affairId: "aff_2",
      sourceUrl: "https://www.lemonde.fr/article.html",
      publishedAt: new Date("2026-08-27T08:00:00.000Z"),
    });
    const otherPublication = computeAffairEventIdentity({
      affairId: "aff_1",
      sourceUrl: "https://www.lemonde.fr/article.html",
      publishedAt: new Date("2026-08-28T08:00:00.000Z"),
    });

    expect(otherAffair).not.toBe(base);
    expect(otherPublication).not.toBe(base);
  });

  it("ignore le titre et le hash de contenu dans l’identité de l’événement", async () => {
    await proposeAffairEvent(EVENT_INPUT);
    await proposeAffairEvent({
      ...EVENT_INPUT,
      sourceTitle: "Un titre éditorial modifié",
      sourceContentHash: "un-autre-hash-de-contenu",
    });

    const identityKeys = db.affairEvent.findUnique.mock.calls.map(
      ([query]) => query.where.affairId_identityKey.identityKey
    );
    expect(identityKeys).toHaveLength(2);
    expect(identityKeys[1]).toBe(identityKeys[0]);
  });

  it("dépose un événement médiatique HIGH sans écrire sur l’affaire", async () => {
    const result = await proposeAffairEvent(EVENT_INPUT);

    expect(result).toMatchObject({ outcome: "CREATED", pendingProposalId: "prop_new" });
    expect(db.affair.update).not.toHaveBeenCalled();
    expect(db.affairEvent.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          affairId_identityKey: {
            affairId: "aff_1",
            identityKey: expect.stringMatching(/^[a-f0-9]{64}$/),
          },
        },
      })
    );
    const created = db.affairUpdateProposal.create.mock.calls[0]![0].data;
    expect(created.riskLevel).toBe("HIGH");
    expect(created.proposedPatch).toEqual({
      addEvent: {
        date: "2026-08-27T08:00:00.000Z",
        type: "REVELATION",
        title: "Publication d’une nouvelle source sur l’évolution de l’affaire",
        description: null,
        sourceUrl: "https://www.lemonde.fr/politique/article-test.html",
        sourceTitle: "Un nouvel article documente l’affaire",
      },
    });
  });

  it("ne dépose rien lorsqu’un événement identique existe déjà", async () => {
    db.affairEvent.findUnique.mockResolvedValue({ id: "event_1" });

    const result = await proposeAffairEvent(EVENT_INPUT);

    expect(result).toEqual({
      outcome: "ALREADY_APPLIED",
      pendingProposalId: null,
      deduped: true,
    });
    expect(db.affairUpdateProposal.create).not.toHaveBeenCalled();
  });

  it("refuse une cible archivée", async () => {
    db.affair.findUnique.mockResolvedValue({ ...EMPTY_AFFAIR, publicationStatus: "ARCHIVED" });

    const result = await proposeAffairEvent(EVENT_INPUT);

    expect(result.outcome).toBe("TARGET_INELIGIBLE");
    expect(db.affairEvent.findUnique).not.toHaveBeenCalled();
    expect(db.affairUpdateProposal.create).not.toHaveBeenCalled();
  });

  it("refuse une source de presse hors de la liste vérifiée", async () => {
    await expect(
      proposeAffairEvent({
        ...EVENT_INPUT,
        sourceUrl: "https://blog.example/article-test",
      })
    ).rejects.toThrow(ProposalValidationError);

    expect(db.affair.findUnique).not.toHaveBeenCalled();
    expect(db.affairUpdateProposal.create).not.toHaveBeenCalled();
  });

  it("refuse une proposition sans extrait vérifié", async () => {
    await expect(proposeAffairEvent({ ...EVENT_INPUT, sourceExcerpt: "   " })).rejects.toThrow(
      ProposalValidationError
    );

    expect(db.affair.findUnique).not.toHaveBeenCalled();
    expect(db.affairUpdateProposal.create).not.toHaveBeenCalled();
  });

  it("ne ressuscite pas une proposition événement rejetée", async () => {
    db.affairUpdateProposal.findFirst.mockResolvedValue({ id: "prop_old", status: "REJECTED" });

    const result = await proposeAffairEvent(EVENT_INPUT);

    expect(result).toMatchObject({
      outcome: "DEDUPED_TERMINAL",
      pendingProposalId: "prop_old",
      existingStatus: "REJECTED",
    });
    expect(db.affairUpdateProposal.create).not.toHaveBeenCalled();
  });

  it("prévisualise une proposition terminale sans écriture", async () => {
    db.affairUpdateProposal.findFirst.mockResolvedValue({ id: "prop_old", status: "REJECTED" });

    const result = await previewAffairEventProposal(EVENT_INPUT);

    expect(result).toMatchObject({
      outcome: "DEDUPED_TERMINAL",
      pendingProposalId: "prop_old",
      existingStatus: "REJECTED",
    });
    expect(db.affairUpdateProposal.create).not.toHaveBeenCalled();
    expect(db.affairUpdateProposal.update).not.toHaveBeenCalled();
  });
});
