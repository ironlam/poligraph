import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MeasureConcurrencyError } from "@/lib/measures/errors";
import { validEvidenceSnapshot } from "./evidence-snapshot-fixture";

const mocks = vi.hoisted(() => ({
  findMeasure: vi.fn(),
  findMeasures: vi.fn(),
  callMistral: vi.fn(),
  extractMistralText: vi.fn(),
  parseMistralJSON: vi.fn(),
  draftMeasureRevision: vi.fn(),
  findAuditLogs: vi.fn(),
  createAuditLog: vi.fn(),
  findMeasureForUpdate: vi.fn(),
  updateMeasure: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    measure: { findUnique: mocks.findMeasure, findMany: mocks.findMeasures },
    auditLog: {
      findMany: mocks.findAuditLogs,
      create: mocks.createAuditLog,
    },
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
      callback({
        measure: {
          findUniqueOrThrow: mocks.findMeasureForUpdate,
          update: mocks.updateMeasure,
        },
        auditLog: { create: mocks.createAuditLog, findMany: mocks.findAuditLogs },
      })
    ),
  },
}));
vi.mock("@/lib/measures/lock", () => ({ lockMeasure: vi.fn(async () => undefined) }));
vi.mock("@/lib/api/mistral", () => ({
  callMistral: mocks.callMistral,
  extractMistralText: mocks.extractMistralText,
  parseMistralJSON: mocks.parseMistralJSON,
}));
vi.mock("@/lib/measures/transitions", () => ({
  draftMeasureRevision: mocks.draftMeasureRevision,
}));

function measure(overrides: Record<string, unknown> = {}) {
  const revision = {
    id: "revision-1",
    text: "Créer un droit aux vacances.",
    details: null,
    precision: "OBJECTIF_SANS_CHIFFRE",
    validFrom: new Date("2026-08-01T00:00:00Z"),
    evidenceSnapshot: validEvidenceSnapshot(),
    reviewedAt: new Date("2026-08-20T00:00:00Z"),
    publishedAt: new Date("2026-08-21T00:00:00Z"),
    discardedAt: null,
    rejectedAt: null,
    extractionMethod: "AI_ASSISTED",
    extractorVersion: null,
  };
  return {
    id: "measure-1",
    updatedAt: new Date("2026-08-30T00:00:00Z"),
    latestRevisionId: "revision-1",
    publishedRevisionId: "revision-1",
    publishedRevision: revision,
    latestRevision: revision,
    revisions: [],
    ...overrides,
  };
}

function generatedContext(details: string, evidenceUnitIds = ["pdf-12-2-u001", "pdf-13-1-u001"]) {
  return {
    claims: [{ text: details, evidenceUnitIds }],
  };
}

function measureWithSupportingContext(
  context: string,
  numbers: Array<{ raw: string; normalized: string; role: "STRUCTURAL" | "CONTENT" }> = []
) {
  const snapshot = validEvidenceSnapshot();
  const anchor = snapshot.units.find((unit) => unit.role === "COMMITMENT_ANCHOR");
  const supporting = snapshot.units.find((unit) => unit.role === "SUPPORTING_CONTEXT");
  if (!anchor || !supporting) throw new Error("Preuve de test incomplète");
  const hash = createHash("sha256").update(context, "utf8").digest("hex");
  supporting.rawExactText = context;
  supporting.canonicalText = context;
  supporting.numbers = numbers;
  supporting.rawTextHash = hash;
  supporting.canonicalTextHash = hash;
  snapshot.canonicalEvidenceHash = createHash("sha256")
    .update(`${anchor.canonicalText}\n\n${context}`, "utf8")
    .digest("hex");
  return measure({
    publishedRevision: { ...measure().publishedRevision, evidenceSnapshot: snapshot },
  });
}

describe("génération de contexte sourcé", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findMeasure.mockResolvedValue(measure());
    mocks.findMeasureForUpdate.mockResolvedValue({
      latestRevisionId: "revision-1",
      publishedRevisionId: "revision-1",
      updatedAt: new Date("2026-08-30T00:00:00Z"),
    });
    mocks.findAuditLogs.mockResolvedValue([]);
    mocks.createAuditLog.mockResolvedValue({ id: "audit-1" });
    mocks.updateMeasure.mockResolvedValue({ id: "measure-1" });
    mocks.callMistral.mockResolvedValue({ model: "mistral-small-2506", choices: [] });
    mocks.extractMistralText.mockReturnValue("{}");
    mocks.parseMistralJSON.mockReturnValue(
      generatedContext(
        "Selon la source citée, une partie de la population ne part pas en vacances. La mesure prévoit de créer un droit aux vacances en réponse à ce constat."
      )
    );
    mocks.draftMeasureRevision.mockResolvedValue({ revisionId: "revision-2" });
  });

  it("crée un brouillon IA en conservant la preuve et une trace des unités citées", async () => {
    const { generateMeasureContextDraft } = await import("../context-generation");

    const result = await generateMeasureContextDraft("measure-1", {
      generatedBy: "admin",
      ipAddress: "203.0.113.8",
      userAgent: "vitest-agent",
    });

    expect(result.status).toBe("CREATED");
    expect(mocks.draftMeasureRevision).toHaveBeenCalledWith(
      expect.objectContaining({
        measureId: "measure-1",
        preserveEvidenceFromRevisionId: "revision-1",
        revision: expect.objectContaining({
          extractionMethod: "AI_ASSISTED",
          extractorVersion: "mistral-small-2506:measure-context-v9",
          details: expect.stringContaining("droit aux vacances"),
        }),
        generatedContext: expect.objectContaining({
          claims: [
            expect.objectContaining({
              evidenceUnitIds: ["pdf-12-2-u001", "pdf-13-1-u001"],
            }),
          ],
          evidenceUnitIds: ["pdf-12-2-u001", "pdf-13-1-u001"],
          ipAddress: "203.0.113.8",
          promptVersion: "measure-context-v9",
          userAgent: "vitest-agent",
        }),
      })
    );
    expect(mocks.callMistral).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          content: expect.stringContaining(
            "ne présente jamais l'argumentaire du programme comme un fait établi"
          ),
        }),
      ],
      expect.any(Object)
    );
    const prompt = mocks.callMistral.mock.calls[0]?.[0]?.[0]?.content;
    expect(prompt).toContain("Selon la source citée");
    expect(prompt).toContain("La mesure prévoit");
    expect(prompt).toContain("N'écris jamais « Le document » ni « Le programme »");
  });

  it("refuse les attributions mécaniques avant de créer un brouillon", async () => {
    mocks.parseMistralJSON.mockReturnValue(
      generatedContext(
        "Le document présente cette proposition comme une réponse au constat qu'une partie de la population ne part pas en vacances."
      )
    );
    const { generateMeasureContextDraft } = await import("../context-generation");

    await expect(generateMeasureContextDraft("measure-1")).rejects.toThrow("attribution mécanique");
    expect(mocks.callMistral).toHaveBeenCalledTimes(2);
  });

  it("régénère un contexte publié dans un nouveau brouillon sans toucher à la révision publique", async () => {
    const oldContextRevision = {
      ...measure().publishedRevision,
      details: "Ancien contexte publié et validé par la rédaction.",
      extractorVersion: "mistral-small-2506:measure-context-v8",
    };
    mocks.findMeasure.mockResolvedValue(
      measure({ publishedRevision: oldContextRevision, latestRevision: oldContextRevision })
    );
    const { generateMeasureContextDraft } = await import("../context-generation");

    await expect(
      generateMeasureContextDraft("measure-1", {
        regenerateFromPromptVersion: "measure-context-v8",
      })
    ).resolves.toMatchObject({ status: "CREATED" });
    expect(mocks.draftMeasureRevision).toHaveBeenCalledWith(
      expect.objectContaining({
        preserveEvidenceFromRevisionId: "revision-1",
        revision: expect.objectContaining({
          extractorVersion: "mistral-small-2506:measure-context-v9",
        }),
      })
    );
  });

  it("remplace uniquement un brouillon IA non relu provenant de la version demandée", async () => {
    const activeDraft = {
      ...measure().publishedRevision,
      id: "revision-v8-draft",
      details: "Ancien contexte généré en attente de relecture.",
      reviewedAt: null,
      publishedAt: null,
      extractorVersion: "mistral-small-2506:measure-context-v8",
    };
    mocks.findMeasure.mockResolvedValue(
      measure({ latestRevisionId: activeDraft.id, latestRevision: activeDraft })
    );
    mocks.findMeasureForUpdate.mockResolvedValue({
      latestRevisionId: activeDraft.id,
      publishedRevisionId: "revision-1",
      updatedAt: new Date("2026-08-30T00:00:00Z"),
    });
    const { generateMeasureContextDraft } = await import("../context-generation");

    await expect(
      generateMeasureContextDraft("measure-1", {
        regenerateFromPromptVersion: "measure-context-v8",
      })
    ).resolves.toMatchObject({ status: "CREATED" });
    expect(mocks.draftMeasureRevision).toHaveBeenCalledWith(
      expect.objectContaining({ preserveEvidenceFromRevisionId: activeDraft.id })
    );
  });

  it("refuse de remplacer un brouillon humain ou une version différente", async () => {
    const activeDraft = {
      ...measure().publishedRevision,
      id: "revision-human-draft",
      details: "Correction éditoriale en cours.",
      reviewedAt: null,
      publishedAt: null,
      extractionMethod: "MANUAL",
      extractorVersion: null,
    };
    mocks.findMeasure.mockResolvedValue(
      measure({ latestRevisionId: activeDraft.id, latestRevision: activeDraft })
    );
    const { generateMeasureContextDraft } = await import("../context-generation");

    await expect(
      generateMeasureContextDraft("measure-1", {
        regenerateFromPromptVersion: "measure-context-v8",
      })
    ).resolves.toEqual({ status: "SKIPPED", reason: "NOT_REGENERATABLE_CONTEXT" });
    expect(mocks.callMistral).not.toHaveBeenCalled();
  });

  it("sélectionne les contextes publiés et les brouillons IA de l'ancienne version", async () => {
    mocks.findMeasures.mockResolvedValue([
      {
        id: "measure-published-v8",
        latestRevisionId: "revision-published-v8",
        publishedRevisionId: "revision-published-v8",
        latestRevision: {
          evidenceSnapshot: validEvidenceSnapshot(),
          reviewedAt: new Date("2026-08-20T00:00:00Z"),
          publishedAt: new Date("2026-08-21T00:00:00Z"),
        },
      },
      {
        id: "measure-draft-v8",
        latestRevisionId: "revision-draft-v8",
        publishedRevisionId: "revision-base",
        latestRevision: {
          evidenceSnapshot: validEvidenceSnapshot(),
          reviewedAt: null,
          publishedAt: null,
        },
      },
    ]);
    const { findMeasureContextRegenerationCandidateIds } = await import("../context-generation");

    await expect(
      findMeasureContextRegenerationCandidateIds({
        electionSlug: "presidentielle-2027",
        fromPromptVersion: "measure-context-v8",
        limit: 10,
        scope: "all",
      })
    ).resolves.toEqual(["measure-published-v8", "measure-draft-v8"]);
    expect(mocks.findMeasures).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          latestRevision: {
            is: expect.objectContaining({
              extractorVersion: { endsWith: ":measure-context-v8" },
            }),
          },
        }),
      })
    );
  });

  it("écarte les tentatives terminales avant d'appliquer la limite de régénération", async () => {
    const regenerationCandidate = (id: string) => ({
      id: `measure-${id}`,
      latestRevisionId: `revision-${id}`,
      publishedRevisionId: `revision-${id}`,
      latestRevision: {
        evidenceSnapshot: validEvidenceSnapshot(),
        reviewedAt: new Date("2026-08-20T00:00:00Z"),
        publishedAt: new Date("2026-08-21T00:00:00Z"),
      },
    });
    mocks.findMeasures
      .mockResolvedValueOnce([regenerationCandidate("terminal"), regenerationCandidate("eligible")])
      .mockResolvedValueOnce([regenerationCandidate("next")]);
    mocks.findAuditLogs
      .mockResolvedValueOnce([
        {
          action: "GENERATE_CONTEXT_TERMINAL_RESULT",
          changes: { outcome: "NO_USEFUL_CONTEXT" },
          entityId: "revision-terminal",
        },
      ])
      .mockResolvedValueOnce([]);
    const { findMeasureContextRegenerationCandidateIds } = await import("../context-generation");

    await expect(
      findMeasureContextRegenerationCandidateIds(
        {
          electionSlug: "presidentielle-2027",
          fromPromptVersion: "measure-context-v8",
          limit: 2,
          scope: "published",
        },
        2
      )
    ).resolves.toEqual(["measure-eligible", "measure-next"]);
    expect(mocks.findMeasures).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ cursor: { id: "measure-eligible" }, skip: 1 })
    );
  });

  it("transmet au modèle le locuteur et le rôle discursif de chaque preuve", async () => {
    const snapshot = validEvidenceSnapshot();
    const supportingUnit = snapshot.units.find((unit) => unit.unitId === "pdf-13-1-u001");
    if (!supportingUnit) throw new Error("Unité de contexte de test introuvable");
    supportingUnit.speaker = "QUOTED_THIRD_PARTY";
    supportingUnit.discourseRole = "TESTIMONY";
    mocks.findMeasure.mockResolvedValue(
      measure({
        publishedRevision: {
          ...measure().publishedRevision,
          evidenceSnapshot: snapshot,
        },
      })
    );
    const { generateMeasureContextDraft } = await import("../context-generation");

    await generateMeasureContextDraft("measure-1");

    expect(mocks.callMistral).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          content: expect.stringMatching(
            /locuteur="QUOTED_THIRD_PARTY" role-discursif="TESTIMONY"/
          ),
        }),
      ],
      expect.any(Object)
    );
    expect(mocks.callMistral.mock.calls[0]?.[0]?.[0]?.content).toContain(
      "ne doit jamais être attribuée au programme"
    );
    expect(mocks.callMistral.mock.calls[0]?.[0]?.[0]?.content).toContain(
      "proviennent exclusivement de la source attachée à la mesure"
    );
  });

  it("borne chaque extrait de preuve avant son interpolation dans le prompt", async () => {
    const snapshot = validEvidenceSnapshot();
    const supportingUnit = snapshot.units.find((unit) => unit.unitId === "pdf-13-1-u001");
    if (!supportingUnit) throw new Error("Unité de contexte de test introuvable");
    supportingUnit.rawExactText = `${"A".repeat(220)}INSTRUCTION_A_IGNORER`;
    supportingUnit.rawTextHash = createHash("sha256")
      .update(supportingUnit.rawExactText, "utf8")
      .digest("hex");
    mocks.findMeasure.mockResolvedValue(
      measure({
        publishedRevision: {
          ...measure().publishedRevision,
          evidenceSnapshot: snapshot,
        },
      })
    );
    const { generateMeasureContextDraft } = await import("../context-generation");

    await generateMeasureContextDraft("measure-1");

    expect(mocks.callMistral).toHaveBeenCalledOnce();
    const prompt = mocks.callMistral.mock.calls[0]?.[0]?.[0]?.content;
    expect(prompt).toContain("A".repeat(200));
    expect(prompt).not.toContain("INSTRUCTION_A_IGNORER");
  });

  it("ne remplace jamais un brouillon éditorial déjà actif", async () => {
    mocks.findMeasure.mockResolvedValue(measure({ latestRevisionId: "revision-human-draft" }));
    const { generateMeasureContextDraft } = await import("../context-generation");

    await expect(generateMeasureContextDraft("measure-1")).resolves.toEqual({
      status: "SKIPPED",
      reason: "ACTIVE_DRAFT",
    });
    expect(mocks.callMistral).not.toHaveBeenCalled();
  });

  it("refuse une version déjà obsolète avant tout appel Mistral", async () => {
    const { generateMeasureContextDraft } = await import("../context-generation");

    await expect(
      generateMeasureContextDraft("measure-1", {
        expectedUpdatedAt: new Date("2026-08-29T23:59:00Z"),
      })
    ).rejects.toBeInstanceOf(MeasureConcurrencyError);
    expect(mocks.callMistral).not.toHaveBeenCalled();
  });

  it("refuse de générer sans contexte explicite dans la preuve", async () => {
    const snapshot = validEvidenceSnapshot();
    snapshot.supportingIds = [];
    snapshot.units = snapshot.units.filter((unit) => unit.role === "COMMITMENT_ANCHOR");
    snapshot.canonicalEvidenceHash = "invalidated-by-fixture-change";
    mocks.findMeasure.mockResolvedValue(
      measure({
        publishedRevision: {
          ...measure().publishedRevision,
          evidenceSnapshot: null,
        },
      })
    );
    const { generateMeasureContextDraft } = await import("../context-generation");

    await expect(generateMeasureContextDraft("measure-1")).resolves.toEqual({
      status: "SKIPPED",
      reason: "NO_VALID_EVIDENCE",
    });
    expect(mocks.callMistral).not.toHaveBeenCalled();
  });

  it("refuse une quantité absente des preuves citées après une seule correction", async () => {
    mocks.parseMistralJSON.mockReturnValue(
      generatedContext(
        "Le programme présente cette proposition comme un droit aux vacances destiné à 80 millions de personnes, avec une application générale à toute la population."
      )
    );
    const { generateMeasureContextDraft } = await import("../context-generation");

    await expect(generateMeasureContextDraft("measure-1")).rejects.toThrow(
      "quantité absente de la preuve citée"
    );
    expect(mocks.callMistral).toHaveBeenCalledTimes(2);
    expect(mocks.draftMeasureRevision).not.toHaveBeenCalled();
  });

  it("accepte une quantité exacte lorsqu'elle est rattachée à la preuve qui la contient", async () => {
    const firstClaim = "La mesure prévoit un droit destiné à 67 millions de personnes.";
    const secondClaim =
      "Selon la source citée, une partie de la population ne part pas en vacances.";
    mocks.parseMistralJSON.mockReturnValue({
      claims: [
        { text: firstClaim, evidenceUnitIds: ["pdf-12-2-u001"] },
        { text: secondClaim, evidenceUnitIds: ["pdf-13-1-u001"] },
      ],
    });
    const { generateMeasureContextDraft } = await import("../context-generation");

    await expect(generateMeasureContextDraft("measure-1")).resolves.toMatchObject({
      status: "CREATED",
      evidenceUnitIds: ["pdf-12-2-u001", "pdf-13-1-u001"],
    });
  });

  it("reconnaît le symbole euro et son libellé comme la même unité", async () => {
    mocks.findMeasure.mockResolvedValue(
      measureWithSupportingContext(
        "Le programme prévoit une aide de 2 000 € pour les personnes concernées.",
        [{ raw: "2 000", normalized: "2000", role: "CONTENT" }]
      )
    );
    mocks.parseMistralJSON.mockReturnValue(
      generatedContext(
        "La mesure prévoit une aide de 2000 euros destinée aux personnes concernées par le dispositif.",
        ["pdf-13-1-u001"]
      )
    );
    const { generateMeasureContextDraft } = await import("../context-generation");

    await expect(generateMeasureContextDraft("measure-1")).resolves.toMatchObject({
      status: "CREATED",
    });
  });

  it("refuse d'ajouter l'unité euro à un nombre qui n'en a pas dans la preuve", async () => {
    mocks.findMeasure.mockResolvedValue(
      measureWithSupportingContext("Le programme évoque 2000 personnes concernées.", [
        { raw: "2000", normalized: "2000", role: "CONTENT" },
      ])
    );
    mocks.parseMistralJSON.mockReturnValue(
      generatedContext(
        "Le programme présente cette proposition comme une aide de 2000 euros destinée aux personnes concernées par le dispositif.",
        ["pdf-13-1-u001"]
      )
    );
    const { generateMeasureContextDraft } = await import("../context-generation");

    await expect(generateMeasureContextDraft("measure-1")).rejects.toThrow(
      "quantité absente de la preuve citée"
    );
  });

  it("construit le contexte depuis les seules affirmations sourcées", async () => {
    const claim =
      "Selon la source citée, une partie de la population ne part pas en vacances. La mesure prévoit de créer un droit aux vacances en réponse à ce constat.";
    mocks.parseMistralJSON.mockReturnValue({
      claims: [
        {
          text: claim,
          evidenceUnitIds: ["pdf-12-2-u001", "pdf-13-1-u001"],
        },
      ],
    });
    const { generateMeasureContextDraft } = await import("../context-generation");

    await expect(generateMeasureContextDraft("measure-1")).resolves.toMatchObject({
      status: "CREATED",
      details: claim,
    });
    expect(mocks.draftMeasureRevision).toHaveBeenCalledWith(
      expect.objectContaining({
        measureId: "measure-1",
        revision: expect.objectContaining({ details: claim }),
      })
    );
    expect(mocks.callMistral.mock.calls[0]?.[0]?.[0]?.content).not.toContain('"details"');
  });

  it("refuse d'inverser le signe d'une quantité présente dans la preuve", async () => {
    mocks.parseMistralJSON.mockReturnValue(
      generatedContext(
        "Le programme présente cette proposition comme un droit destiné à -67 millions de personnes."
      )
    );
    const { generateMeasureContextDraft } = await import("../context-generation");

    await expect(generateMeasureContextDraft("measure-1")).rejects.toThrow(
      "quantité absente de la preuve citée"
    );
  });

  it("refuse qu'un numéro de proposition justifie une quantité inventée", async () => {
    mocks.parseMistralJSON.mockReturnValue(
      generatedContext(
        "Le programme présente cette proposition comme un droit aux vacances de 2 heures pour toute la population, sans apporter davantage de précisions."
      )
    );
    const { generateMeasureContextDraft } = await import("../context-generation");

    await expect(generateMeasureContextDraft("measure-1")).rejects.toThrow(
      "quantité absente de la preuve citée"
    );
    expect(mocks.draftMeasureRevision).not.toHaveBeenCalled();
  });

  it("refuse de réattribuer une quantité à une autre unité", async () => {
    mocks.parseMistralJSON.mockReturnValue(
      generatedContext(
        "Le programme présente cette proposition comme un dispositif qui créerait 1 500 emplois, en s’appuyant sur les éléments de contexte cités."
      )
    );
    const { generateMeasureContextDraft } = await import("../context-generation");

    await expect(generateMeasureContextDraft("measure-1")).rejects.toThrow(
      "quantité absente de la preuve citée"
    );
  });

  it("refuse les quantités écrites en lettres", async () => {
    mocks.parseMistralJSON.mockReturnValue(
      generatedContext(
        "Le programme présente cette proposition comme un droit destiné à quatre-vingts millions de personnes, sans apporter d'autre précision."
      )
    );
    const { generateMeasureContextDraft } = await import("../context-generation");

    await expect(generateMeasureContextDraft("measure-1")).rejects.toThrow(
      "quantité absente de la preuve citée"
    );
  });

  it.each([
    "plusieurs milliers d’emplois",
    "une centaine de bénéficiaires",
    "de nombreuses personnes",
    "un grand nombre de personnes",
  ])("refuse aussi la quantité approximative « %s »", async (quantity) => {
    mocks.parseMistralJSON.mockReturnValue(
      generatedContext(
        `Le programme rattache cette proposition à un objectif qui concernerait ${quantity}, sans apporter davantage d'éléments de contexte.`
      )
    );
    const { generateMeasureContextDraft } = await import("../context-generation");

    await expect(generateMeasureContextDraft("measure-1")).rejects.toThrow(
      "quantité absente de la preuve citée"
    );
  });

  it.each(["aucun logement", "un bénéficiaire", "une première phase", "un tiers des Français"])(
    "refuse la quantité non sourcée « %s »",
    async (quantity) => {
      mocks.parseMistralJSON.mockReturnValue(
        generatedContext(
          `Le programme rattache cette proposition à ${quantity} dans les territoires concernés et la présente comme un élément de contexte distinct.`
        )
      );
      const { generateMeasureContextDraft } = await import("../context-generation");

      await expect(generateMeasureContextDraft("measure-1")).rejects.toThrow(
        "quantité absente de la preuve citée"
      );
    }
  );

  it.each([
    { evidence: "Le document ne prévoit aucun logement vacant.", generated: "un logement" },
    { evidence: "Le document prévoit un logement vacant.", generated: "aucun logement" },
  ])(
    "refuse d'inverser la quantité entre « $evidence » et « $generated »",
    async ({ evidence, generated }) => {
      mocks.findMeasure.mockResolvedValue(measureWithSupportingContext(evidence));
      mocks.parseMistralJSON.mockReturnValue(
        generatedContext(
          `Le programme rattache cette proposition à ${generated} dans les territoires concernés et la présente comme un élément de contexte distinct.`,
          ["pdf-13-1-u001"]
        )
      );
      const { generateMeasureContextDraft } = await import("../context-generation");

      await expect(generateMeasureContextDraft("measure-1")).rejects.toThrow(
        "quantité absente de la preuve citée"
      );
    }
  );

  it("cherche l'historique du contexte sur la révision publiée uniquement", async () => {
    mocks.findAuditLogs.mockResolvedValue([
      {
        action: "GENERATE_CONTEXT_DRAFT",
        changes: { previousRevisionId: "revision-published" },
        entityId: "revision-generated",
      },
    ]);
    const { hasContextAttemptForRevision } = await import("../context-generation");

    await expect(hasContextAttemptForRevision("revision-published")).resolves.toBe(true);
    expect(mocks.findAuditLogs).toHaveBeenCalledWith({
      where: expect.objectContaining({
        OR: expect.arrayContaining([
          expect.objectContaining({
            action: "GENERATE_CONTEXT_DRAFT",
            changes: { path: ["previousRevisionId"], equals: "revision-published" },
          }),
        ]),
      }),
      select: { action: true, changes: true, entityId: true },
    });
  });

  it("réessaie une fois une réponse invalide enregistrée par l'ancienne version", async () => {
    mocks.findAuditLogs.mockResolvedValue([
      {
        action: "GENERATE_CONTEXT_TERMINAL_RESULT",
        changes: { outcome: "INVALID_GENERATED_CONTEXT" },
        entityId: "revision-1",
      },
    ]);
    const { generateMeasureContextDraft } = await import("../context-generation");

    await expect(generateMeasureContextDraft("measure-1")).resolves.toMatchObject({
      status: "CREATED",
    });
    expect(mocks.callMistral).toHaveBeenCalledOnce();
  });

  it("ne propose à l'admin que les mesures réellement éligibles", async () => {
    const validEvidence = measure().publishedRevision.evidenceSnapshot;
    mocks.findMeasures.mockResolvedValue([
      {
        id: "measure-invalid",
        latestRevisionId: "revision-1",
        publishedRevisionId: "revision-1",
        publishedRevision: { evidenceSnapshot: null },
        revisions: [],
      },
      {
        id: "measure-draft",
        latestRevisionId: "revision-2",
        publishedRevisionId: "revision-1",
        publishedRevision: { evidenceSnapshot: validEvidence },
        revisions: [],
      },
      {
        id: "measure-rejected",
        latestRevisionId: "revision-1",
        publishedRevisionId: "revision-1",
        publishedRevision: { evidenceSnapshot: validEvidence },
        revisions: [{ id: "revision-rejected" }],
      },
      {
        id: "measure-eligible",
        latestRevisionId: "revision-1",
        publishedRevisionId: "revision-1",
        publishedRevision: { evidenceSnapshot: validEvidence },
        revisions: [],
      },
    ]);
    const { filterMeasureContextCandidateIds } = await import("../context-generation");

    await expect(
      filterMeasureContextCandidateIds(["measure-invalid", "measure-draft", "measure-eligible"], 10)
    ).resolves.toEqual(["measure-eligible"]);
  });

  it("pagine au-delà des premières mesures inéligibles", async () => {
    const ineligible = (id: string) => ({
      id,
      latestRevisionId: `${id}-draft`,
      publishedRevisionId: `${id}-published`,
      publishedRevision: { evidenceSnapshot: validEvidenceSnapshot() },
      revisions: [],
    });
    const eligible = (id: string) => ({
      id,
      latestRevisionId: `${id}-published`,
      publishedRevisionId: `${id}-published`,
      publishedRevision: { evidenceSnapshot: validEvidenceSnapshot() },
      revisions: [],
    });
    mocks.findMeasures
      .mockResolvedValueOnce([ineligible("measure-1"), ineligible("measure-2")])
      .mockResolvedValueOnce([eligible("measure-3")]);
    const { findMeasureContextCandidateIds } = await import("../context-generation");

    await expect(findMeasureContextCandidateIds("presidentielle-2027", 1, 2)).resolves.toEqual([
      "measure-3",
    ]);
    expect(mocks.findMeasures).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ cursor: { id: "measure-2" }, skip: 1 })
    );
  });

  it("accepte que le modèle juge le contexte insuffisant sans créer de brouillon", async () => {
    mocks.parseMistralJSON.mockReturnValue({ claims: [] });
    const { generateMeasureContextDraft } = await import("../context-generation");

    await expect(generateMeasureContextDraft("measure-1")).resolves.toEqual({
      status: "SKIPPED",
      reason: "NO_USEFUL_CONTEXT",
    });
    expect(mocks.draftMeasureRevision).not.toHaveBeenCalled();
    expect(mocks.createAuditLog).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "GENERATE_CONTEXT_TERMINAL_RESULT",
        entityType: "MeasureRevision",
        entityId: "revision-1",
      }),
    });
  });

  it("refuse de tracer une issue terminale à partir d'une version devenue obsolète", async () => {
    mocks.parseMistralJSON.mockReturnValue({ claims: [] });
    mocks.findMeasureForUpdate.mockResolvedValue({
      latestRevisionId: "revision-1",
      publishedRevisionId: "revision-1",
      updatedAt: new Date("2026-08-30T00:01:00Z"),
    });
    const { generateMeasureContextDraft } = await import("../context-generation");

    await expect(
      generateMeasureContextDraft("measure-1", {
        expectedUpdatedAt: new Date("2026-08-30T00:00:00Z"),
      })
    ).rejects.toBeInstanceOf(MeasureConcurrencyError);
    expect(mocks.createAuditLog).not.toHaveBeenCalled();
  });

  it("ne relance pas Mistral après un résultat sans contexte utile sur la même révision", async () => {
    mocks.findAuditLogs.mockResolvedValue([
      {
        action: "GENERATE_CONTEXT_TERMINAL_RESULT",
        changes: { outcome: "NO_USEFUL_CONTEXT" },
        entityId: "revision-1",
      },
    ]);
    const { generateMeasureContextDraft } = await import("../context-generation");

    await expect(generateMeasureContextDraft("measure-1")).resolves.toEqual({
      status: "SKIPPED",
      reason: "PREVIOUS_CONTEXT_ATTEMPT",
    });
    expect(mocks.callMistral).not.toHaveBeenCalled();
  });

  it("exclut des lots une révision déjà jugée sans contexte utile", async () => {
    const candidate = {
      id: "measure-terminal",
      latestRevisionId: "revision-terminal",
      publishedRevisionId: "revision-terminal",
      publishedRevision: { evidenceSnapshot: validEvidenceSnapshot() },
      revisions: [],
    };
    mocks.findMeasures.mockResolvedValue([candidate]);
    mocks.findAuditLogs.mockResolvedValue([
      {
        action: "GENERATE_CONTEXT_TERMINAL_RESULT",
        changes: null,
        entityId: "revision-terminal",
      },
    ]);
    const { filterMeasureContextCandidateIds } = await import("../context-generation");

    await expect(filterMeasureContextCandidateIds(["measure-terminal"])).resolves.toEqual([]);
  });

  it("réinclut dans les lots une révision qui n'a produit qu'une réponse invalide", async () => {
    const candidate = {
      id: "measure-retry",
      latestRevisionId: "revision-retry",
      publishedRevisionId: "revision-retry",
      publishedRevision: { evidenceSnapshot: validEvidenceSnapshot() },
    };
    mocks.findMeasures.mockResolvedValue([candidate]);
    mocks.findAuditLogs.mockResolvedValue([
      {
        action: "GENERATE_CONTEXT_TERMINAL_RESULT",
        changes: { outcome: "INVALID_GENERATED_CONTEXT" },
        entityId: "revision-retry",
      },
    ]);
    const { filterMeasureContextCandidateIds } = await import("../context-generation");

    await expect(filterMeasureContextCandidateIds(["measure-retry"])).resolves.toEqual([
      "measure-retry",
    ]);
  });

  it("exclut une révision après deux réponses invalides", async () => {
    const candidate = {
      id: "measure-exhausted",
      latestRevisionId: "revision-exhausted",
      publishedRevisionId: "revision-exhausted",
      publishedRevision: { evidenceSnapshot: validEvidenceSnapshot() },
    };
    mocks.findMeasures.mockResolvedValue([candidate]);
    mocks.findAuditLogs.mockResolvedValue([
      {
        action: "GENERATE_CONTEXT_INVALID_RESULT",
        changes: { outcome: "INVALID_GENERATED_CONTEXT" },
        entityId: "revision-exhausted",
      },
      {
        action: "GENERATE_CONTEXT_TERMINAL_RESULT",
        changes: { outcome: "INVALID_GENERATED_CONTEXT" },
        entityId: "revision-exhausted",
      },
    ]);
    const { filterMeasureContextCandidateIds } = await import("../context-generation");

    await expect(filterMeasureContextCandidateIds(["measure-exhausted"])).resolves.toEqual([]);
  });

  it("réouvre le budget après une évolution du générateur", async () => {
    const candidate = {
      id: "measure-old-prompt",
      latestRevisionId: "revision-old-prompt",
      publishedRevisionId: "revision-old-prompt",
      publishedRevision: { evidenceSnapshot: validEvidenceSnapshot() },
    };
    mocks.findMeasures.mockResolvedValue([candidate]);
    mocks.findAuditLogs.mockResolvedValue([
      {
        action: "GENERATE_CONTEXT_INVALID_RESULT",
        changes: {
          outcome: "INVALID_GENERATED_CONTEXT",
          promptVersion: "measure-context-v8",
        },
        entityId: "revision-old-prompt",
      },
      {
        action: "GENERATE_CONTEXT_TERMINAL_RESULT",
        changes: {
          outcome: "INVALID_GENERATED_CONTEXT",
          promptVersion: "measure-context-v8",
        },
        entityId: "revision-old-prompt",
      },
    ]);
    const { filterMeasureContextCandidateIds } = await import("../context-generation");

    await expect(filterMeasureContextCandidateIds(["measure-old-prompt"])).resolves.toEqual([
      "measure-old-prompt",
    ]);
  });

  it("exclut temporairement une révision réservée par une autre génération", async () => {
    const candidate = {
      id: "measure-reserved",
      latestRevisionId: "revision-reserved",
      publishedRevisionId: "revision-reserved",
      publishedRevision: { evidenceSnapshot: validEvidenceSnapshot() },
    };
    mocks.findMeasures.mockResolvedValue([candidate]);
    mocks.findAuditLogs.mockResolvedValue([
      {
        action: "RESERVE_CONTEXT_GENERATION",
        changes: { expiresAt: "2999-01-01T00:00:00.000Z" },
        entityId: "revision-reserved",
      },
    ]);
    const { filterMeasureContextCandidateIds } = await import("../context-generation");

    await expect(filterMeasureContextCandidateIds(["measure-reserved"])).resolves.toEqual([]);
  });

  it("réautorise une génération dont la réservation a expiré", async () => {
    const candidate = {
      id: "measure-expired",
      latestRevisionId: "revision-expired",
      publishedRevisionId: "revision-expired",
      publishedRevision: { evidenceSnapshot: validEvidenceSnapshot() },
    };
    mocks.findMeasures.mockResolvedValue([candidate]);
    mocks.findAuditLogs.mockResolvedValue([
      {
        action: "RESERVE_CONTEXT_GENERATION",
        changes: { expiresAt: "2020-01-01T00:00:00.000Z" },
        entityId: "revision-expired",
      },
    ]);
    const { filterMeasureContextCandidateIds } = await import("../context-generation");

    await expect(filterMeasureContextCandidateIds(["measure-expired"])).resolves.toEqual([
      "measure-expired",
    ]);
  });

  it("réautorise une nouvelle révision publiée après un ancien contexte généré", async () => {
    mocks.findMeasures.mockResolvedValue([
      {
        id: "measure-fresh",
        latestRevisionId: "revision-fresh",
        publishedRevisionId: "revision-fresh",
        publishedRevision: { evidenceSnapshot: validEvidenceSnapshot() },
      },
    ]);
    mocks.findAuditLogs.mockResolvedValue([
      {
        action: "GENERATE_CONTEXT_DRAFT",
        changes: { previousRevisionId: "revision-old" },
        entityId: "revision-generated-old",
      },
    ]);
    const { filterMeasureContextCandidateIds } = await import("../context-generation");

    await expect(filterMeasureContextCandidateIds(["measure-fresh"])).resolves.toEqual([
      "measure-fresh",
    ]);
  });

  it("accepte un sous-ensemble pertinent des unités fournies au modèle", async () => {
    const details =
      "Selon la source citée, une partie de la population ne part pas en vacances. Cet extrait n'apporte pas d'autre justification à la mesure.";
    mocks.parseMistralJSON.mockReturnValue(generatedContext(details, ["pdf-13-1-u001"]));
    const { generateMeasureContextDraft } = await import("../context-generation");

    await expect(generateMeasureContextDraft("measure-1")).resolves.toMatchObject({
      status: "CREATED",
      evidenceUnitIds: ["pdf-13-1-u001"],
    });
  });

  it("trace une réponse JSON invalide avant de remonter l'erreur", async () => {
    mocks.parseMistralJSON.mockImplementation(() => {
      throw new SyntaxError("Invalid JSON");
    });
    const { generateMeasureContextDraft } = await import("../context-generation");

    await expect(generateMeasureContextDraft("measure-1")).rejects.toThrow(
      "ne respecte pas le format attendu"
    );
    expect(mocks.createAuditLog).toHaveBeenCalledWith({
      data: expect.objectContaining({
        changes: expect.objectContaining({ outcome: "INVALID_GENERATED_CONTEXT" }),
      }),
    });
    expect(mocks.callMistral).toHaveBeenCalledTimes(2);
  });

  it("corrige une première réponse invalide sans dépasser deux appels", async () => {
    mocks.parseMistralJSON.mockReturnValueOnce(
      generatedContext(
        "Le programme présente cette proposition comme un droit destiné à 80 millions de personnes et la rattache au contexte décrit dans le document."
      )
    );
    const { generateMeasureContextDraft } = await import("../context-generation");

    await expect(generateMeasureContextDraft("measure-1")).resolves.toMatchObject({
      status: "CREATED",
    });
    expect(mocks.callMistral).toHaveBeenCalledTimes(2);
    expect(mocks.createAuditLog).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "GENERATE_CONTEXT_INVALID_RESULT",
        changes: expect.objectContaining({ outcome: "INVALID_GENERATED_CONTEXT" }),
      }),
    });
  });

  it("accepte l'attribution des propos à un tiers sans la confondre avec une fraction", async () => {
    mocks.parseMistralJSON.mockReturnValue(
      generatedContext(
        "Selon la source citée, ces propos viennent d'un tiers et sont distincts de la position défendue dans cette proposition."
      )
    );
    const { generateMeasureContextDraft } = await import("../context-generation");

    await expect(generateMeasureContextDraft("measure-1")).resolves.toMatchObject({
      status: "CREATED",
    });
  });

  it("accepte le titre de Première ministre sans le confondre avec un ordinal", async () => {
    mocks.parseMistralJSON.mockReturnValue(
      generatedContext(
        "Selon la source citée, cette proposition est attribuée à la Première ministre et constitue une orientation défendue dans cette mesure."
      )
    );
    const { generateMeasureContextDraft } = await import("../context-generation");

    await expect(generateMeasureContextDraft("measure-1")).resolves.toMatchObject({
      status: "CREATED",
    });
  });

  it("invalide le jeton de version avec l'issue terminale", async () => {
    mocks.parseMistralJSON.mockReturnValue({ claims: [] });
    const { generateMeasureContextDraft } = await import("../context-generation");

    await generateMeasureContextDraft("measure-1");

    expect(mocks.updateMeasure).toHaveBeenCalledWith({
      where: { id: "measure-1" },
      data: { updatedAt: expect.any(Date) },
    });
  });
});
