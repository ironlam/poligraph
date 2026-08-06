import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

const transitionsMock = {
  createMeasure: vi.fn(async () => ({ measureId: "m-1", revisionId: "rev-1" })),
  draftMeasureRevision: vi.fn(async () => ({ revisionId: "rev-2" })),
  reviewMeasureRevision: vi.fn(async () => undefined),
  discardMeasureRevision: vi.fn(async () => undefined),
  publishMeasureRevision: vi.fn(async () => undefined),
  depublishMeasure: vi.fn(async () => undefined),
  withdrawMeasure: vi.fn(async () => undefined),
};

vi.mock("@/lib/auth", () => ({ isAuthenticated: () => isAuthenticatedMock() }));
vi.mock("next/cache", () => ({ revalidatePath: (path: string) => revalidatePathMock(path) }));
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
      name: "discardRevisionAction",
      call: () => a.discardRevisionAction({ measureId: "m-1", revisionId: "rev-1" }),
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

  it("refuse les sept actions sans session, sans rien écrire", async () => {
    isAuthenticatedMock.mockResolvedValue(false);

    for (const { name, call } of await everyAction()) {
      await expect(call(), name).rejects.toThrow("Non autorisé");
    }

    for (const [name, mock] of Object.entries(transitionsMock)) {
      expect(mock, name).not.toHaveBeenCalled();
    }
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("laisse passer les sept actions avec une session valide", async () => {
    // Without this case, a guard that refused unconditionally would pass the test above while
    // making the admin unusable.
    isAuthenticatedMock.mockResolvedValue(true);

    for (const { name, call } of await everyAction()) {
      await expect(call(), name).resolves.toMatchObject({ ok: true });
    }

    for (const [name, mock] of Object.entries(transitionsMock)) {
      expect(mock, name).toHaveBeenCalledTimes(1);
    }
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
