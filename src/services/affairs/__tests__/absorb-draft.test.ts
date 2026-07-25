import { describe, it, expect, vi, beforeEach } from "vitest";

// Issue #525 §4 — absorbing a draft into a published affair may add, never rewrite.
// Anything the draft states about the judicial outcome goes to the proposal queue.

const h = vi.hoisted(() => ({
  findUnique: vi.fn(),
  mergeAffairs: vi.fn(),
  proposeAffairUpdate: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: { affair: { findUnique: h.findUnique } } }));
vi.mock("../reconciliation", () => ({
  mergeAffairs: h.mergeAffairs,
  ABSORPTION_ADDITIVE_FIELDS: ["ecli", "pourvoiNumber", "caseNumber"],
}));
vi.mock("../proposals", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../proposals")>();
  return {
    normalizeForCompare: actual.normalizeForCompare,
    proposeAffairUpdate: h.proposeAffairUpdate,
  };
});

import { absorbDraftIntoPublished } from "../absorb-draft";

function affair(overrides: Record<string, unknown> = {}) {
  return {
    id: "x",
    title: "Titre",
    description: "Description",
    category: "AUTRE",
    status: null,
    verdictDate: null,
    court: null,
    sentence: null,
    prisonMonths: null,
    prisonSuspended: null,
    fineAmount: null,
    ineligibilityMonths: null,
    communityService: null,
    otherSentence: null,
    publicationStatus: "DRAFT",
    sources: [],
    ...overrides,
  };
}

function stub(published: Record<string, unknown>, draft: Record<string, unknown>) {
  h.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
    Promise.resolve(where.id === published.id ? published : draft)
  );
}

/** The patch handed to the proposal queue, or null when nothing was proposed. */
function proposedPatch(): Record<string, unknown> | null {
  const call = h.proposeAffairUpdate.mock.calls[0];
  return call ? (call[0].patch as Record<string, unknown>) : null;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.mergeAffairs.mockResolvedValue({
    sourcesMoved: 0,
    eventsMoved: 0,
    articlesMoved: 0,
    identifiersMerged: [],
    slugsPreserved: [],
  });
  h.proposeAffairUpdate.mockResolvedValue({
    autoApplied: [],
    autoProposalId: null,
    pendingProposalId: "prop_1",
    conflictProposalId: null,
    deduped: false,
  });
});

const base = {
  importRunId: "run_1",
  reason: "Identifiant judiciaire commun (pourvoiNumber)",
};

describe("absorbDraftIntoPublished — l'affaire publiée n'est pas réécrite (#525)", () => {
  it("n'écrase aucun champ sensible non nul de l'affaire publiée", async () => {
    stub(
      affair({
        id: "pub",
        publicationStatus: "PUBLISHED",
        status: "CONDAMNATION_DEFINITIVE",
        court: "Cour de cassation",
        sentence: "6 mois avec sursis",
        verdictDate: new Date("2024-01-15"),
      }),
      affair({
        id: "draft",
        status: "PROCES_EN_COURS",
        court: "Tribunal correctionnel de Paris",
        sentence: "réquisitions de 12 mois",
        verdictDate: new Date("2024-01-20"),
      })
    );

    await absorbDraftIntoPublished({ publishedId: "pub", draftId: "draft", ...base });

    // Le service de fusion est appelé avec la seule liste additive restreinte :
    // ni court ni chamber ne peuvent y être remplis.
    const mergeOptions = h.mergeAffairs.mock.calls[0]![2];
    expect(mergeOptions.additiveFields).toEqual(["ecli", "pourvoiNumber", "caseNumber"]);
    expect(mergeOptions.additiveFields).not.toContain("court");
    expect(mergeOptions.additiveFields).not.toContain("chamber");

    // Et le survivant est bien l'affaire publiée.
    expect(h.mergeAffairs).toHaveBeenCalledWith("pub", "draft", expect.anything());
  });

  it("crée une proposition pour chaque donnée sensible divergente", async () => {
    stub(
      affair({
        id: "pub",
        publicationStatus: "PUBLISHED",
        status: "CONDAMNATION_DEFINITIVE",
        court: null,
      }),
      affair({
        id: "draft",
        status: "PROCES_EN_COURS",
        court: "Tribunal correctionnel de Paris",
        prisonMonths: 6,
      })
    );

    const result = await absorbDraftIntoPublished({
      publishedId: "pub",
      draftId: "draft",
      ...base,
    });

    expect(proposedPatch()).toEqual({
      status: "PROCES_EN_COURS",
      court: "Tribunal correctionnel de Paris",
      prisonMonths: 6,
    });
    expect(result.proposalsCreated).toBe(1);
    expect(h.proposeAffairUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ affairId: "pub", importRunId: "run_1" })
    );
  });

  it("ne propose pas un champ que l'affaire publiée porte déjà à l'identique", async () => {
    stub(
      affair({ id: "pub", publicationStatus: "PUBLISHED", court: "Cour de cassation" }),
      affair({ id: "draft", court: "Cour de cassation" })
    );

    const result = await absorbDraftIntoPublished({
      publishedId: "pub",
      draftId: "draft",
      ...base,
    });

    expect(h.proposeAffairUpdate).not.toHaveBeenCalled();
    expect(result.proposalsCreated).toBe(0);
  });

  it("garde trace des différences ni transférées ni proposables", async () => {
    stub(
      affair({
        id: "pub",
        publicationStatus: "PUBLISHED",
        category: "AUTRE",
        title: "Titre publié",
      }),
      affair({ id: "draft", category: "RECEL", title: "Titre du brouillon" })
    );

    const result = await absorbDraftIntoPublished({
      publishedId: "pub",
      draftId: "draft",
      ...base,
    });

    expect(result.recordedDifferences).toEqual(expect.arrayContaining(["title", "category"]));
    // Rien n'est perdu en silence : la valeur absorbée part dans la piste d'audit.
    const notes = h.mergeAffairs.mock.calls[0]![2].auditNotes;
    expect(notes.recordedDifferences).toEqual(
      expect.arrayContaining([{ field: "category", absorbedValue: "RECEL" }])
    );
  });
});

describe("absorbDraftIntoPublished — refuse de se tromper de sens (#525)", () => {
  it("refuse si le survivant n'est pas publié", async () => {
    stub(affair({ id: "pub", publicationStatus: "DRAFT" }), affair({ id: "draft" }));

    await expect(
      absorbDraftIntoPublished({ publishedId: "pub", draftId: "draft", ...base })
    ).rejects.toThrow("n'est pas publiée");
    expect(h.mergeAffairs).not.toHaveBeenCalled();
  });

  it("refuse si l'affaire absorbée n'est pas un brouillon", async () => {
    stub(
      affair({ id: "pub", publicationStatus: "PUBLISHED" }),
      affair({ id: "draft", publicationStatus: "PUBLISHED" })
    );

    await expect(
      absorbDraftIntoPublished({ publishedId: "pub", draftId: "draft", ...base })
    ).rejects.toThrow("n'est pas un brouillon");
    expect(h.mergeAffairs).not.toHaveBeenCalled();
  });

  it("refuse si une des deux affaires a disparu", async () => {
    h.findUnique.mockResolvedValue(null);

    await expect(
      absorbDraftIntoPublished({ publishedId: "pub", draftId: "draft", ...base })
    ).rejects.toThrow("introuvable");
    expect(h.mergeAffairs).not.toHaveBeenCalled();
  });
});
