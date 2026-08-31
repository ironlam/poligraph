import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Chamber } from "@/generated/prisma";
import { MeasureConcurrencyError, MeasureValidationError } from "@/lib/measures/errors";

/**
 * The editorial actions.
 *
 * A server action is a network endpoint: the page guard does not protect it, so the first thing
 * each test checks is that an unauthenticated call writes NOTHING. Asserting only that it throws
 * would not be enough, since a throw after the write would look identical.
 */

const isAuthenticatedMock = vi.fn<() => Promise<boolean>>();
const revalidatePathMock = vi.fn();
const headersMock = vi.fn(
  async () =>
    new Headers({
      "user-agent": "vitest-agent",
      "x-forwarded-for": "203.0.113.8, 10.0.0.1",
    })
);

const transitionsMock = {
  createMeasure: vi.fn(async () => ({ measureId: "m-1", revisionId: "rev-1" })),
  draftMeasureRevision: vi.fn(async () => ({ revisionId: "rev-2" })),
  reviewMeasureRevision: vi.fn(async () => undefined),
  discardMeasureRevision: vi.fn(async () => undefined),
  rejectMeasureRevision: vi.fn(async () => undefined),
  publishMeasureRevision: vi.fn(async () => undefined),
  depublishMeasure: vi.fn(async () => undefined),
  withdrawMeasure: vi.fn(async () => undefined),
};

vi.mock("@/lib/auth", () => ({ isAuthenticated: () => isAuthenticatedMock() }));
vi.mock("next/cache", () => ({ revalidatePath: (path: string) => revalidatePathMock(path) }));
vi.mock("next/headers", () => ({ headers: () => headersMock() }));
vi.mock("@/lib/measures/transitions", () => transitionsMock);

const assessmentsMock = {
  createQualification: vi.fn(async () => undefined),
  createSimilarityAssessment: vi.fn(async () => undefined),
};
vi.mock("@/lib/measures/assessments", () => assessmentsMock);

// The hub candidacy gate (#660). Default impl returns the everyAction table's e-1/p-1 so the
// authenticated table test still succeeds; individual tests override it. clearAllMocks keeps the impl.
const eligibilityMock = {
  assertHubMeasureCandidacy: vi.fn(async () => ({ electionId: "e-1", politicianId: "p-1" })),
};
vi.mock("../_data/candidacy-eligibility", () => eligibilityMock);

// The measure vote-link writer (#662). Mocked so importing actions does not pull the real @/lib/db.
const voteLinksMock = {
  createMeasureVoteLink: vi.fn(async () => ({ id: "vl-1" })),
};
vi.mock("@/lib/measures/vote-links", () => voteLinksMock);

const subtopicsMock = {
  proposeMeasureRevisionSubtopics: vi.fn(async () => ({
    revisionId: "rev-1",
    suggestions: [],
    skipped: false,
  })),
  reviewMeasureRevisionSubtopic: vi.fn(async () => undefined),
};
vi.mock("@/lib/measures/subtopics", () => subtopicsMock);

const readerGuidesMock = {
  proposeReaderGuidesForRevision: vi.fn(async () => ({ created: 0, proposals: [] })),
  reviewReaderGuideMention: vi.fn(async () => undefined),
  saveReaderGuideDraft: vi.fn(async () => "guide-1"),
  publishReaderGuide: vi.fn(async () => undefined),
  deactivateReaderGuide: vi.fn(async () => 1),
};
vi.mock("@/lib/measures/reader-guides", () => readerGuidesMock);

const contextGenerationMock = {
  generateMeasureContextDraft: vi.fn(async () => ({
    status: "CREATED" as const,
    revisionId: "rev-context",
    details: "Contexte documenté.",
    model: "mistral-small-2506",
    evidenceUnitIds: ["unit-1"],
  })),
};
vi.mock("@/lib/measures/context-generation", () => contextGenerationMock);

const REVISION = {
  text: "Encadrer les loyers dans les zones tendues.",
  precision: "OBJECTIF_SANS_CHIFFRE" as const,
  validFrom: "2027-01-15T00:00:00.000Z",
  extractionMethod: "MANUAL" as const,
};

const SOURCES = [
  {
    sourceKind: "PROGRAMME_PARTI" as const,
    tier: "PRIMARY" as const,
    url: "https://example.org/programme.pdf",
    page: "12",
    publishedAt: "2027-01-15T00:00:00.000Z",
  },
];

async function actions() {
  return import("../actions");
}

/** One entry per action, with a call that would succeed if the guard were absent. */
async function everyAction(): Promise<{ name: string; call: () => Promise<unknown> }[]> {
  const a = await actions();
  return [
    {
      name: "createMeasureAction",
      call: () =>
        a.createMeasureAction({
          candidacyId: "c-1",
          politicianId: "p-1",
          electionId: "e-1",
          theme: "LOGEMENT_URBANISME",
          attribution: "PERSONAL",
          revision: REVISION,
          sources: SOURCES,
        }),
    },
    {
      name: "draftRevisionAction",
      call: () =>
        a.draftRevisionAction({
          measureId: "m-1",
          revision: REVISION,
          sources: SOURCES,
          expectedUpdatedAt: "2027-01-16T10:00:00.000Z",
        }),
    },
    {
      name: "reviewRevisionAction",
      call: () => a.reviewRevisionAction({ measureId: "m-1", revisionId: "rev-1" }),
    },
    {
      name: "proposeSubtopicsAction",
      call: () => a.proposeSubtopicsAction({ measureId: "m-1", revisionId: "rev-1" }),
    },
    {
      name: "reviewSubtopicAction",
      call: () =>
        a.reviewSubtopicAction({
          measureId: "m-1",
          revisionId: "rev-1",
          subtopicId: "subtopic-1",
          status: "APPROVED",
        }),
    },
    {
      name: "proposeReaderGuidesAction",
      call: () => a.proposeReaderGuidesAction({ measureId: "m-1", revisionId: "rev-1" }),
    },
    {
      name: "reviewReaderGuideMentionAction",
      call: () =>
        a.reviewReaderGuideMentionAction({
          measureId: "m-1",
          mentionId: "mention-1",
          guideId: "guide-1",
          status: "APPROVED",
        }),
    },
    {
      name: "saveReaderGuideDraftAction",
      call: () =>
        a.saveReaderGuideDraftAction({
          slug: "zones-faibles-emissions",
          label: "Zone à faibles émissions",
          definition:
            "Un périmètre routier où la circulation des véhicules polluants est restreinte.",
          aliases: ["ZFE"],
          sourceKind: "OFFICIAL_INSTITUTION",
          sourceUrl: "https://www.ecologie.gouv.fr/zfe",
          sourceLabel: "Zones à faibles émissions",
          sourcePublisher: "Ministère de la Transition écologique",
        }),
    },
    {
      name: "publishReaderGuideAction",
      call: () => a.publishReaderGuideAction({ guideId: "guide-1" }),
    },
    {
      name: "deactivateReaderGuideAction",
      call: () => a.deactivateReaderGuideAction({ guideId: "guide-1" }),
    },
    {
      name: "generateContextDraftAction",
      call: () =>
        a.generateContextDraftAction({
          measureId: "m-1",
          expectedUpdatedAt: "2027-01-16T10:00:00.000Z",
        }),
    },
    {
      name: "discardRevisionAction",
      call: () => a.discardRevisionAction({ measureId: "m-1", revisionId: "rev-1" }),
    },
    {
      name: "rejectRevisionAction",
      call: () =>
        a.rejectRevisionAction({
          measureId: "m-1",
          revisionId: "rev-1",
          reason: "DIAGNOSIS_ONLY",
          detail: null,
        }),
    },
    {
      name: "publishRevisionAction",
      call: () =>
        a.publishRevisionAction({
          measureId: "m-1",
          revisionId: "rev-1",
          expectedUpdatedAt: "2027-01-16T10:00:00.000Z",
        }),
    },
    {
      name: "depublishMeasureAction",
      call: () =>
        a.depublishMeasureAction({
          measureId: "m-1",
          reason: "Source à vérifier",
          expectedUpdatedAt: "2027-01-16T10:00:00.000Z",
        }),
    },
    {
      name: "withdrawMeasureAction",
      call: () =>
        a.withdrawMeasureAction({
          measureId: "m-1",
          withdrawnAt: "2027-03-01T00:00:00.000Z",
          sourceUrl: "https://example.org/retrait",
          sourceLabel: "Conférence de presse",
          expectedUpdatedAt: "2027-01-16T10:00:00.000Z",
        }),
    },
  ];
}

describe("actions éditoriales : la session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refuse toutes les actions sans session, sans rien écrire", async () => {
    isAuthenticatedMock.mockResolvedValue(false);

    for (const { name, call } of await everyAction()) {
      await expect(call(), name).rejects.toThrow("Non autorisé");
    }

    for (const [name, mock] of Object.entries(transitionsMock)) {
      expect(mock, name).not.toHaveBeenCalled();
    }
    expect(subtopicsMock.proposeMeasureRevisionSubtopics).not.toHaveBeenCalled();
    expect(subtopicsMock.reviewMeasureRevisionSubtopic).not.toHaveBeenCalled();
    expect(readerGuidesMock.proposeReaderGuidesForRevision).not.toHaveBeenCalled();
    expect(readerGuidesMock.reviewReaderGuideMention).not.toHaveBeenCalled();
    expect(readerGuidesMock.saveReaderGuideDraft).not.toHaveBeenCalled();
    expect(readerGuidesMock.publishReaderGuide).not.toHaveBeenCalled();
    expect(readerGuidesMock.deactivateReaderGuide).not.toHaveBeenCalled();
    expect(contextGenerationMock.generateMeasureContextDraft).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("laisse passer toutes les actions avec une session valide", async () => {
    // Without this case, a guard that refused unconditionally would pass the test above while
    // making the admin unusable.
    isAuthenticatedMock.mockResolvedValue(true);

    for (const { name, call } of await everyAction()) {
      await expect(call(), name).resolves.toMatchObject({ ok: true });
    }

    for (const [name, mock] of Object.entries(transitionsMock)) {
      expect(mock, name).toHaveBeenCalledTimes(1);
    }
    expect(subtopicsMock.proposeMeasureRevisionSubtopics).toHaveBeenCalledTimes(1);
    expect(subtopicsMock.reviewMeasureRevisionSubtopic).toHaveBeenCalledTimes(1);
    expect(readerGuidesMock.proposeReaderGuidesForRevision).toHaveBeenCalledTimes(1);
    expect(readerGuidesMock.reviewReaderGuideMention).toHaveBeenCalledTimes(1);
    expect(readerGuidesMock.saveReaderGuideDraft).toHaveBeenCalledTimes(1);
    expect(readerGuidesMock.publishReaderGuide).toHaveBeenCalledTimes(1);
    expect(readerGuidesMock.deactivateReaderGuide).toHaveBeenCalledTimes(1);
    expect(contextGenerationMock.generateMeasureContextDraft).toHaveBeenCalledTimes(1);
    expect(readerGuidesMock.proposeReaderGuidesForRevision).toHaveBeenCalledWith("rev-1", "admin", {
      ipAddress: "203.0.113.8",
      userAgent: "vitest-agent",
    });
    expect(readerGuidesMock.reviewReaderGuideMention).toHaveBeenCalledWith(
      expect.objectContaining({ ipAddress: "203.0.113.8", userAgent: "vitest-agent" })
    );
    expect(readerGuidesMock.saveReaderGuideDraft).toHaveBeenCalledWith(
      expect.objectContaining({ sourceKind: "OFFICIAL_INSTITUTION" }),
      "admin",
      { ipAddress: "203.0.113.8", userAgent: "vitest-agent" }
    );
    expect(readerGuidesMock.publishReaderGuide).toHaveBeenCalledWith("guide-1", "admin", {
      ipAddress: "203.0.113.8",
      userAgent: "vitest-agent",
    });
    expect(readerGuidesMock.deactivateReaderGuide).toHaveBeenCalledWith("guide-1", "admin", {
      ipAddress: "203.0.113.8",
      userAgent: "vitest-agent",
    });
  });
});

describe("génération assistée du contexte", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isAuthenticatedMock.mockResolvedValue(true);
    contextGenerationMock.generateMeasureContextDraft.mockResolvedValue({
      status: "CREATED",
      revisionId: "rev-context",
      details: "Contexte documenté.",
      model: "mistral-small-2506",
      evidenceUnitIds: ["unit-1"],
    });
  });

  it("transmet la version affichée et attribue le brouillon à l'admin", async () => {
    const result = await (
      await actions()
    ).generateContextDraftAction({
      measureId: "m-1",
      expectedUpdatedAt: "2027-01-16T10:00:00.000Z",
    });

    expect(result).toEqual({ ok: true, measureId: "m-1" });
    expect(contextGenerationMock.generateMeasureContextDraft).toHaveBeenCalledWith("m-1", {
      expectedUpdatedAt: new Date("2027-01-16T10:00:00.000Z"),
      generatedBy: "admin",
      ipAddress: "203.0.113.8",
      userAgent: "vitest-agent",
    });
  });

  it("limite strictement un lot à dix mesures", async () => {
    const action = await actions();
    await expect(
      action.generateContextDraftBatchAction({
        measureIds: Array.from({ length: 11 }, (_, index) => `m-${index}`),
      })
    ).rejects.toThrow("1 à 10 mesures");
    expect(contextGenerationMock.generateMeasureContextDraft).not.toHaveBeenCalled();
  });
});

describe("createMeasureAction : garde de candidature du hub (#660)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isAuthenticatedMock.mockResolvedValue(true);
  });

  const call = (a: Awaited<ReturnType<typeof actions>>) =>
    a.createMeasureAction({
      candidacyId: "c-1",
      politicianId: "p-1",
      electionId: "e-1",
      theme: "LOGEMENT_URBANISME",
      attribution: "PERSONAL",
      revision: REVISION,
      sources: SOURCES,
    });

  it("crée la mesure avec l'élection et le politicien lus SUR la candidature", async () => {
    eligibilityMock.assertHubMeasureCandidacy.mockResolvedValue({
      electionId: "e-1",
      politicianId: "p-1",
    });
    const result = await call(await actions());

    expect(result).toEqual({ ok: true, measureId: "m-1" });
    expect(transitionsMock.createMeasure).toHaveBeenCalledWith(
      expect.objectContaining({ electionId: "e-1", politicianId: "p-1", candidacyId: "c-1" })
    );
  });

  it("refuse et n'écrit rien quand la garde rejette la candidature", async () => {
    eligibilityMock.assertHubMeasureCandidacy.mockRejectedValue(
      new MeasureValidationError("La candidature doit être déclarée pour porter une mesure.")
    );
    const result = await call(await actions());

    expect(result.ok).toBe(false);
    expect(transitionsMock.createMeasure).not.toHaveBeenCalled();
  });

  it("refuse quand l'élection de la candidature ne correspond pas au formulaire", async () => {
    eligibilityMock.assertHubMeasureCandidacy.mockResolvedValue({
      electionId: "autre-election",
      politicianId: "p-1",
    });
    const result = await call(await actions());

    expect(result.ok).toBe(false);
    expect(transitionsMock.createMeasure).not.toHaveBeenCalled();
  });
});

describe("actions de revue des imports V6", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isAuthenticatedMock.mockResolvedValue(true);
  });

  it("demande à la transition de conserver la preuve lors d'une correction", async () => {
    const a = await actions();
    await a.draftRevisionAction({
      measureId: "m-1",
      revision: { ...REVISION, text: "Encadrer les loyers." },
      sources: [],
      expectedUpdatedAt: "2027-01-16T10:00:00.000Z",
      preserveEvidenceFromRevisionId: "rev-1",
    });

    expect(transitionsMock.draftMeasureRevision).toHaveBeenCalledWith(
      expect.objectContaining({ preserveEvidenceFromRevisionId: "rev-1", sources: [] })
    );
  });

  it("enregistre un rejet humain structuré", async () => {
    const a = await actions();
    await a.rejectRevisionAction({
      measureId: "m-1",
      revisionId: "rev-1",
      reason: "DIAGNOSIS_ONLY",
      detail: "Le passage décrit uniquement la situation actuelle.",
    });

    expect(transitionsMock.rejectMeasureRevision).toHaveBeenCalledWith({
      measureId: "m-1",
      revisionId: "rev-1",
      reason: "DIAGNOSIS_ONLY",
      detail: "Le passage décrit uniquement la situation actuelle.",
      rejectedBy: "admin",
    });
  });
});

describe("actions éditoriales : la traduction des erreurs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isAuthenticatedMock.mockResolvedValue(true);
  });

  it("rend une erreur métier au lieu de la jeter", async () => {
    // A reviewer needs the reason on screen. Throwing would give an error page instead.
    transitionsMock.publishMeasureRevision.mockRejectedValueOnce(
      new MeasureValidationError("Une révision non relue ne peut pas être publiée")
    );
    const { publishRevisionAction } = await actions();

    const result = await publishRevisionAction({
      measureId: "m-1",
      revisionId: "rev-1",
      expectedUpdatedAt: "2027-01-16T10:00:00.000Z",
    });

    expect(result).toEqual({
      ok: false,
      message: "Une révision non relue ne peut pas être publiée",
    });
  });

  it("distingue un conflit de version et dit quoi faire", async () => {
    transitionsMock.publishMeasureRevision.mockRejectedValueOnce(
      new MeasureConcurrencyError("m-1", new Date("2027-01-16T10:00:00Z"), new Date())
    );
    const { publishRevisionAction } = await actions();

    const result = await publishRevisionAction({
      measureId: "m-1",
      revisionId: "rev-1",
      expectedUpdatedAt: "2027-01-16T10:00:00.000Z",
    });

    expect(result).toMatchObject({ ok: false, stale: true });
    expect(result).toHaveProperty("message", expect.stringContaining("Recharger"));
  });

  it("ne déguise pas une erreur inattendue en message métier", async () => {
    // A connection loss is not a reviewer mistake, and showing it as one would send someone
    // looking for a data problem that does not exist.
    transitionsMock.depublishMeasure.mockRejectedValueOnce(new Error("connection terminated"));
    const { depublishMeasureAction } = await actions();

    await expect(
      depublishMeasureAction({
        measureId: "m-1",
        reason: "Source à vérifier",
        expectedUpdatedAt: "2027-01-16T10:00:00.000Z",
      })
    ).rejects.toThrow("connection terminated");
  });

  it("refuse une date invalide avant d'appeler la transition", async () => {
    const { withdrawMeasureAction } = await actions();

    const result = await withdrawMeasureAction({
      measureId: "m-1",
      withdrawnAt: "pas une date",
      sourceUrl: "https://example.org/retrait",
      sourceLabel: "Conférence de presse",
      expectedUpdatedAt: "2027-01-16T10:00:00.000Z",
    });

    expect(result).toEqual({ ok: false, message: "La date de retrait n'est pas une date valide" });
    expect(transitionsMock.withdrawMeasure).not.toHaveBeenCalled();
  });
});

describe("publication par lot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const input = {
    items: [
      {
        measureId: "m-1",
        revisionId: "rev-1",
        expectedUpdatedAt: "2027-01-16T10:00:00.000Z",
        batchKind: "FIRST_PUBLICATION",
      },
      {
        measureId: "m-2",
        revisionId: "rev-2",
        expectedUpdatedAt: "2027-01-17T10:00:00.000Z",
        batchKind: "FIRST_PUBLICATION",
      },
    ],
  };

  it("refuse le lot sans session avant toute publication", async () => {
    isAuthenticatedMock.mockResolvedValue(false);
    const { publishReviewedBatchAction } = await actions();

    await expect(publishReviewedBatchAction(input)).rejects.toThrow("Non autorisé");
    expect(transitionsMock.publishMeasureRevision).not.toHaveBeenCalled();
  });

  it("publie toutes les révisions du lot via la transition et trace l'acteur", async () => {
    isAuthenticatedMock.mockResolvedValue(true);
    const { publishReviewedBatchAction } = await actions();

    const result = await publishReviewedBatchAction(input);

    expect(result).toEqual({ ok: true, publishedCount: 2 });
    expect(transitionsMock.publishMeasureRevision).toHaveBeenNthCalledWith(1, {
      measureId: "m-1",
      revisionId: "rev-1",
      expectedUpdatedAt: new Date("2027-01-16T10:00:00.000Z"),
      batchKind: "FIRST_PUBLICATION",
      publishedBy: "admin",
    });
    expect(transitionsMock.publishMeasureRevision).toHaveBeenNthCalledWith(2, {
      measureId: "m-2",
      revisionId: "rev-2",
      expectedUpdatedAt: new Date("2027-01-17T10:00:00.000Z"),
      batchKind: "FIRST_PUBLICATION",
      publishedBy: "admin",
    });
  });

  it("refuse une charge mal formée avant toute publication", async () => {
    isAuthenticatedMock.mockResolvedValue(true);
    const { publishReviewedBatchAction } = await actions();

    const result = await publishReviewedBatchAction({ items: [] });

    expect(result).toMatchObject({ ok: false, publishedCount: 0 });
    expect(transitionsMock.publishMeasureRevision).not.toHaveBeenCalled();
  });
});

describe("relecture par lot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const input = {
    items: [
      { measureId: "m-1", revisionId: "rev-1", batchKind: "FIRST_PUBLICATION" },
      { measureId: "m-2", revisionId: "rev-2", batchKind: "FIRST_PUBLICATION" },
    ],
  };

  it("refuse le lot sans session avant toute relecture", async () => {
    isAuthenticatedMock.mockResolvedValue(false);
    const { reviewDraftBatchAction } = await actions();

    await expect(reviewDraftBatchAction(input)).rejects.toThrow("Non autorisé");
    expect(transitionsMock.reviewMeasureRevision).not.toHaveBeenCalled();
  });

  it("relit toutes les révisions du lot via la transition et trace l'acteur", async () => {
    isAuthenticatedMock.mockResolvedValue(true);
    const { reviewDraftBatchAction } = await actions();

    const result = await reviewDraftBatchAction(input);

    expect(result).toEqual({ ok: true, reviewedCount: 2 });
    expect(transitionsMock.reviewMeasureRevision).toHaveBeenNthCalledWith(1, {
      measureId: "m-1",
      revisionId: "rev-1",
      batchKind: "FIRST_PUBLICATION",
      reviewedBy: "admin",
    });
    expect(transitionsMock.reviewMeasureRevision).toHaveBeenNthCalledWith(2, {
      measureId: "m-2",
      revisionId: "rev-2",
      batchKind: "FIRST_PUBLICATION",
      reviewedBy: "admin",
    });
  });

  it("refuse une charge mal formée avant toute relecture", async () => {
    isAuthenticatedMock.mockResolvedValue(true);
    const { reviewDraftBatchAction } = await actions();

    const result = await reviewDraftBatchAction({ items: [] });

    expect(result).toMatchObject({ ok: false, reviewedCount: 0 });
    expect(transitionsMock.reviewMeasureRevision).not.toHaveBeenCalled();
  });
});

describe("actions éditoriales : ce qu'elles transmettent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isAuthenticatedMock.mockResolvedValue(true);
  });

  it("attribue la relecture à l'acteur admin, jamais à un nom saisi", async () => {
    const { reviewRevisionAction } = await actions();

    await reviewRevisionAction({ measureId: "m-1", revisionId: "rev-1" });

    expect(transitionsMock.reviewMeasureRevision).toHaveBeenCalledWith({
      measureId: "m-1",
      revisionId: "rev-1",
      reviewedBy: "admin",
    });
  });

  it("transmet la version attendue à la publication", async () => {
    // This is what makes the optimistic concurrency reachable from the interface. Dropping it
    // here would leave the check in place and never exercised.
    const { publishRevisionAction } = await actions();

    await publishRevisionAction({
      measureId: "m-1",
      revisionId: "rev-1",
      expectedUpdatedAt: "2027-01-16T10:00:00.000Z",
    });

    expect(transitionsMock.publishMeasureRevision).toHaveBeenCalledWith({
      measureId: "m-1",
      revisionId: "rev-1",
      expectedUpdatedAt: new Date("2027-01-16T10:00:00.000Z"),
      publishedBy: "admin",
    });
  });

  it("invalide les deux chemins admin après une écriture", async () => {
    const { reviewRevisionAction } = await actions();

    await reviewRevisionAction({ measureId: "m-1", revisionId: "rev-1" });

    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/mesures");
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/mesures/m-1");
  });
});

describe("écrivain unique : la route admin n'écrit pas en base elle-même", () => {
  it("ne contient aucune écriture Prisma hors des transitions", () => {
    // La garde porte sur « aucune écriture Prisma », pas sur les noms de champs : queue-query.ts
    // et detail-query.ts SÉLECTIONNENT légitimement publishedRevisionId et withdrawnAt, donc
    // chercher ces clés confondrait une lecture et une écriture.
    //
    // L'invariant du lot 1 est que src/lib/measures/transitions.ts est le seul écrivain des
    // pointeurs et des trois champs de retrait. Une route admin qui écrirait directement le
    // contournerait sans que rien ne plante.
    const root = join(process.cwd(), "src/app/admin/mesures");
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          if (entry === "__tests__") continue;
          walk(full);
          continue;
        }
        if (entry.endsWith(".ts") || entry.endsWith(".tsx")) files.push(full);
      }
    };
    walk(root);

    const WRITE =
      /\b(?:db|tx|prisma|client)\.[a-zA-Z]+\.(?:create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/;
    const offenders = files.filter((file) => WRITE.test(readFileSync(file, "utf8")));

    expect(offenders.map((f) => f.replace(process.cwd() + "/", ""))).toEqual([]);
    // Sans cette borne, renommer les fichiers rendrait la règle verte et vide.
    expect(files.length).toBeGreaterThanOrEqual(8);
  });
});

describe("conclusions éditoriales : pas de jeton de version, une révision explicite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isAuthenticatedMock.mockResolvedValue(true);
  });

  it("refuse les deux actions sans session, sans rien écrire", async () => {
    isAuthenticatedMock.mockResolvedValue(false);
    const a = await actions();

    await expect(
      a.createQualificationAction({
        measureId: "m-1",
        revisionId: "rev-1",
        kind: "FINANCEMENT_NON_PRECISE",
        rationale: "x",
        sourceUrl: null,
        sourceLabel: null,
      })
    ).rejects.toThrow("Non autorisé");
    await expect(
      a.createSimilarityAssessmentAction({
        measureId: "m-1",
        revisionId: "rev-1",
        comparedCorpusVersion: "2027-01",
        conclusion: "NO_EQUIVALENT_FOUND",
        rationale: "x",
        equivalentRevisionIds: [],
      })
    ).rejects.toThrow("Non autorisé");

    expect(assessmentsMock.createQualification).not.toHaveBeenCalled();
    expect(assessmentsMock.createSimilarityAssessment).not.toHaveBeenCalled();
  });

  it("dérive le libellé du qualificatif de l'enum et attribue l'auteur à admin", async () => {
    // Deux formulations différentes du même qualificatif rendraient les définitions opposables
    // inopposables, donc le libellé suit l'enum et n'est pas saisi.
    const { createQualificationAction } = await actions();

    await createQualificationAction({
      measureId: "m-1",
      revisionId: "rev-1",
      kind: "DEJA_TENTEE",
      rationale: "Dispositif comparable en 2018.",
      sourceUrl: null,
      sourceLabel: null,
    });

    expect(assessmentsMock.createQualification).toHaveBeenCalledWith({
      measureRevisionId: "rev-1",
      kind: "DEJA_TENTEE",
      label: "Déjà tentée",
      rationale: "Dispositif comparable en 2018.",
      sourceUrl: null,
      sourceLabel: null,
      assessedBy: "admin",
    });
  });

  it("rend l'erreur de cohérence conclusion / équivalents", async () => {
    assessmentsMock.createSimilarityAssessment.mockRejectedValueOnce(
      new MeasureValidationError(
        "Une conclusion EQUIVALENT_FOUND exige au moins un équivalent identifié"
      )
    );
    const { createSimilarityAssessmentAction } = await actions();

    const result = await createSimilarityAssessmentAction({
      measureId: "m-1",
      revisionId: "rev-1",
      comparedCorpusVersion: "2027-01",
      conclusion: "EQUIVALENT_FOUND",
      rationale: "x",
      equivalentRevisionIds: [],
    });

    expect(result).toEqual({
      ok: false,
      message: "Une conclusion EQUIVALENT_FOUND exige au moins un équivalent identifié",
    });
  });
});

describe("attachVoteLinkAction : rattachement manuel à un scrutin (#662)", () => {
  const base = {
    measureId: "m-1",
    applicableRevisionId: "rev-1",
    rationale: "Vérifié sur les scrutins d'amendement du texte.",
    checkedAt: "2026-05-20T00:00:00.000Z",
    institutionScope: ["AN"] as Chamber[],
    legislatureScope: ["17"],
    searchMethod: "Filtre par thème",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    isAuthenticatedMock.mockResolvedValue(true);
  });

  it("refuse sans session, sans rien écrire", async () => {
    isAuthenticatedMock.mockResolvedValue(false);
    const { attachVoteLinkAction } = await actions();

    await expect(
      attachVoteLinkAction({ ...base, situation: { kind: "NO_VOTE_IDENTIFIED" } })
    ).rejects.toThrow("Non autorisé");
    expect(voteLinksMock.createMeasureVoteLink).not.toHaveBeenCalled();
  });

  it("« aucun vote identifié » n'écrit ni scrutin ni relation", async () => {
    const { attachVoteLinkAction } = await actions();

    const result = await attachVoteLinkAction({
      ...base,
      situation: { kind: "NO_VOTE_IDENTIFIED" },
    });

    expect(result).toMatchObject({ ok: true });
    expect(voteLinksMock.createMeasureVoteLink).toHaveBeenCalledWith(
      expect.objectContaining({
        linkKind: "NO_VOTE_IDENTIFIED",
        scrutinId: null,
        relation: null,
        isReference: false,
        checkedAt: new Date("2026-05-20T00:00:00.000Z"),
        reviewedBy: "admin",
      })
    );
  });

  it("une absence est une relation ABSENCE sur un scrutin sur le même objet", async () => {
    const { attachVoteLinkAction } = await actions();

    await attachVoteLinkAction({
      ...base,
      situation: {
        kind: "SAME_OBJECT",
        scrutinId: "s-42",
        relation: "ABSENCE",
        isReference: false,
      },
    });

    expect(voteLinksMock.createMeasureVoteLink).toHaveBeenCalledWith(
      expect.objectContaining({ linkKind: "SAME_OBJECT", scrutinId: "s-42", relation: "ABSENCE" })
    );
  });

  it("un texte plus large ne porte aucune relation", async () => {
    const { attachVoteLinkAction } = await actions();

    await attachVoteLinkAction({ ...base, situation: { kind: "BROADER_TEXT", scrutinId: "s-7" } });

    expect(voteLinksMock.createMeasureVoteLink).toHaveBeenCalledWith(
      expect.objectContaining({
        linkKind: "BROADER_TEXT",
        scrutinId: "s-7",
        relation: null,
        isReference: false,
      })
    );
  });

  it("rend l'erreur métier du backend au lieu de la jeter", async () => {
    voteLinksMock.createMeasureVoteLink.mockRejectedValueOnce(
      new MeasureValidationError("Une référence existe déjà pour cette révision applicable")
    );
    const { attachVoteLinkAction } = await actions();

    const result = await attachVoteLinkAction({
      ...base,
      situation: {
        kind: "SAME_OBJECT",
        scrutinId: "s-1",
        relation: "FAVORABLE",
        isReference: true,
      },
    });

    expect(result).toEqual({
      ok: false,
      message: "Une référence existe déjà pour cette révision applicable",
    });
  });

  it("refuse une date de vérification invalide avant d'écrire", async () => {
    const { attachVoteLinkAction } = await actions();

    const result = await attachVoteLinkAction({
      ...base,
      checkedAt: "pas une date",
      situation: { kind: "NO_VOTE_IDENTIFIED" },
    });

    expect(result).toEqual({
      ok: false,
      message: "La date de vérification n'est pas une date valide",
    });
    expect(voteLinksMock.createMeasureVoteLink).not.toHaveBeenCalled();
  });
});
