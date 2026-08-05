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
      call: () => a.draftRevisionAction({ measureId: "m-1", revision: REVISION, sources: SOURCES }),
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
      call: () => a.depublishMeasureAction({ measureId: "m-1", reason: "Source à vérifier" }),
    },
    {
      name: "withdrawMeasureAction",
      call: () =>
        a.withdrawMeasureAction({
          measureId: "m-1",
          withdrawnAt: "2027-03-01T00:00:00.000Z",
          sourceUrl: "https://example.org/retrait",
          sourceLabel: "Conférence de presse",
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
      depublishMeasureAction({ measureId: "m-1", reason: "Source à vérifier" })
    ).rejects.toThrow("connection terminated");
  });

  it("refuse une date invalide avant d'appeler la transition", async () => {
    const { withdrawMeasureAction } = await actions();

    const result = await withdrawMeasureAction({
      measureId: "m-1",
      withdrawnAt: "pas une date",
      sourceUrl: "https://example.org/retrait",
      sourceLabel: "Conférence de presse",
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
