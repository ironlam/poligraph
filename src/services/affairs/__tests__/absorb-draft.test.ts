import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Issue #525 §4 and the atomicity review of #533.
 *
 * The path used to merge first and propose afterwards: a proposal failing after
 * that commit left the draft already deleted, and what it stated about status,
 * verdict date, court or sentence was lost with no proposal to show for it.
 * Everything below is about one transaction, all-or-nothing.
 */

const calls: string[] = [];

const tx = {
  affair: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
  source: { findMany: vi.fn(), update: vi.fn() },
  affairEvent: { findMany: vi.fn(), update: vi.fn() },
  pressArticleAffair: { findMany: vi.fn(), update: vi.fn() },
  publicIdRedirect: { upsert: vi.fn() },
  dismissedDuplicate: { deleteMany: vi.fn() },
  affairPairDecision: { upsert: vi.fn() },
  affairUpdateProposal: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  auditLog: { create: vi.fn() },
};

/** A real transaction rolls back on throw; the fake records that it did. */
let rolledBack = false;

vi.mock("@/lib/db", () => ({
  db: {
    $transaction: async (fn: (t: unknown) => unknown) => {
      try {
        return await fn(tx);
      } catch (error) {
        rolledBack = true;
        throw error;
      }
    },
  },
}));

vi.mock("../reconciliation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../reconciliation")>();
  return {
    ABSORPTION_ADDITIVE_FIELDS: ["ecli", "pourvoiNumber", "caseNumber"],
    mergeAffairsInTransaction: actual.mergeAffairsInTransaction,
  };
});

import { absorbDraftIntoPublished } from "../absorb-draft";

function affair(overrides: Record<string, unknown> = {}) {
  return {
    id: "x",
    slug: "fiche",
    publicId: "AF-000001",
    oldSlugs: [],
    politicianId: "p1",
    title: "Titre",
    description: "Description",
    category: "AUTRE",
    status: null,
    verdictDate: null,
    court: null,
    chamber: null,
    caseNumber: null,
    ecli: null,
    pourvoiNumber: null,
    caseNumbers: [],
    sentence: null,
    prisonMonths: null,
    prisonSuspended: null,
    fineAmount: null,
    ineligibilityMonths: null,
    communityService: null,
    otherSentence: null,
    publicationStatus: "DRAFT",
    updatedAt: new Date("2026-07-01"),
    politician: { slug: "jean-dupont", fullName: "Jean Dupont" },
    sources: [],
    ...overrides,
  };
}

function stub(published: Record<string, unknown>, draft: Record<string, unknown>) {
  tx.affair.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
    Promise.resolve(where.id === published.id ? published : draft)
  );
}

const base = {
  importRunId: "run_1",
  reason: "Fusion confirmée en revue",
  pairDecision: {
    reviewedBy: "admin",
    signal: { confidence: "HIGH", matchedBy: "pourvoiNumber", score: 0.95 },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
  rolledBack = false;
  tx.source.findMany.mockResolvedValue([]);
  tx.affairEvent.findMany.mockResolvedValue([]);
  tx.pressArticleAffair.findMany.mockResolvedValue([]);
  tx.affairUpdateProposal.findFirst.mockResolvedValue(null);
  tx.affairUpdateProposal.create.mockImplementation(async () => {
    calls.push("proposal");
    return { id: "prop_1" };
  });
  tx.affair.delete.mockImplementation(async () => {
    calls.push("delete");
    return {};
  });
  tx.affairPairDecision.upsert.mockImplementation(async () => {
    calls.push("ruling");
    return { id: "dec_1" };
  });
  tx.auditLog.create.mockImplementation(async () => {
    calls.push("audit");
    return {};
  });
  tx.source.update.mockImplementation(async () => {
    calls.push("source");
    return {};
  });
  tx.affairEvent.update.mockImplementation(async () => {
    calls.push("event");
    return {};
  });
  tx.pressArticleAffair.update.mockImplementation(async () => {
    calls.push("article");
    return {};
  });
});

const publishedAffair = () =>
  affair({ id: "pub", slug: "publiee", publicId: "AF-000001", publicationStatus: "PUBLISHED" });
const draftAffair = (overrides: Record<string, unknown> = {}) =>
  affair({
    id: "draft",
    slug: "brouillon",
    publicId: "AF-000002",
    publicationStatus: "DRAFT",
    status: "PROCES_EN_COURS",
    court: "Tribunal correctionnel de Paris",
    ...overrides,
  });

describe("absorbDraftIntoPublished — tout ou rien (#525)", () => {
  it("valide proposition, fusion, jugement et audit ensemble", async () => {
    stub(publishedAffair(), draftAffair());

    const result = await absorbDraftIntoPublished({
      publishedId: "pub",
      draftId: "draft",
      ...base,
    });

    expect(result.proposalsCreated).toBe(1);
    expect(result.proposedFields).toEqual(expect.arrayContaining(["status", "court"]));
    // La proposition est écrite AVANT la suppression : si elle échoue, rien n'a bougé.
    expect(calls.indexOf("proposal")).toBeLessThan(calls.indexOf("delete"));
    expect(calls).toEqual(expect.arrayContaining(["proposal", "delete", "ruling", "audit"]));
    expect(rolledBack).toBe(false);
  });

  it("ne supprime pas le brouillon si la proposition échoue", async () => {
    stub(publishedAffair(), draftAffair());
    tx.affairUpdateProposal.create.mockRejectedValue(new Error("proposal write failed"));

    await expect(
      absorbDraftIntoPublished({ publishedId: "pub", draftId: "draft", ...base })
    ).rejects.toThrow("proposal write failed");

    expect(rolledBack).toBe(true);
    expect(tx.affair.delete).not.toHaveBeenCalled();
  });

  it("ne déplace aucune relation si la proposition échoue", async () => {
    stub(publishedAffair(), draftAffair());
    tx.source.findMany.mockResolvedValue([{ id: "s1", url: "https://example.org/a" }]);
    tx.affairUpdateProposal.create.mockRejectedValue(new Error("proposal write failed"));

    await expect(
      absorbDraftIntoPublished({ publishedId: "pub", draftId: "draft", ...base })
    ).rejects.toThrow();

    expect(tx.source.update).not.toHaveBeenCalled();
    expect(tx.affairEvent.update).not.toHaveBeenCalled();
    expect(tx.pressArticleAffair.update).not.toHaveBeenCalled();
  });

  it("n'écrit ni jugement ni audit si la proposition échoue", async () => {
    stub(publishedAffair(), draftAffair());
    tx.affairUpdateProposal.create.mockRejectedValue(new Error("proposal write failed"));

    await expect(
      absorbDraftIntoPublished({ publishedId: "pub", draftId: "draft", ...base })
    ).rejects.toThrow();

    expect(tx.affairPairDecision.upsert).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
    expect(tx.publicIdRedirect.upsert).not.toHaveBeenCalled();
  });

  it("annule la proposition si la fusion échoue", async () => {
    stub(publishedAffair(), draftAffair());
    tx.affair.delete.mockRejectedValue(new Error("delete failed"));

    await expect(
      absorbDraftIntoPublished({ publishedId: "pub", draftId: "draft", ...base })
    ).rejects.toThrow("delete failed");

    // La proposition a bien été tentée, mais la transaction est annulée : rien ne
    // subsiste, ce que prouve le rollback de la transaction qui la portait.
    expect(tx.affairUpdateProposal.create).toHaveBeenCalled();
    expect(rolledBack).toBe(true);
  });

  it("annule tout si le jugement de paire échoue", async () => {
    stub(publishedAffair(), draftAffair());
    tx.affairPairDecision.upsert.mockRejectedValue(new Error("ruling failed"));

    await expect(
      absorbDraftIntoPublished({ publishedId: "pub", draftId: "draft", ...base })
    ).rejects.toThrow("ruling failed");

    expect(rolledBack).toBe(true);
  });
});

describe("absorbDraftIntoPublished — ce qui est écrit, et ce qui ne l'est pas (#525)", () => {
  it("n'écrase aucun champ sensible de la fiche publiée", async () => {
    stub(publishedAffair(), draftAffair({ court: "Cour d'appel de Lyon", sentence: "12 mois" }));

    await absorbDraftIntoPublished({ publishedId: "pub", draftId: "draft", ...base });

    const payload = (tx.affair.update.mock.calls[0]?.[0]?.data ?? {}) as Record<string, unknown>;
    for (const field of [
      "status",
      "verdictDate",
      "court",
      "chamber",
      "sentence",
      "title",
      "description",
      "category",
      "involvement",
      "publicationStatus",
    ]) {
      expect(payload).not.toHaveProperty(field);
    }
  });

  it("transfère les identifiants additifs autorisés", async () => {
    stub(
      publishedAffair(),
      draftAffair({ ecli: "ECLI:FR:CCASS:2024:C900009", caseNumber: "24-90009" })
    );

    const result = await absorbDraftIntoPublished({
      publishedId: "pub",
      draftId: "draft",
      ...base,
    });

    const payload = (tx.affair.update.mock.calls[0]?.[0]?.data ?? {}) as Record<string, unknown>;
    expect(payload).toMatchObject({
      ecli: "ECLI:FR:CCASS:2024:C900009",
      caseNumber: "24-90009",
    });
    expect(result.slugsPreserved).toEqual(["brouillon"]);
  });

  it("préserve le slug absorbé et la redirection du publicId", async () => {
    stub(publishedAffair(), draftAffair({ oldSlugs: ["brouillon-v1"] }));

    const result = await absorbDraftIntoPublished({
      publishedId: "pub",
      draftId: "draft",
      ...base,
    });

    expect(result.slugsPreserved).toEqual(["brouillon", "brouillon-v1"]);
    expect(tx.publicIdRedirect.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { fromPublicId: "AF-000002" },
        create: expect.objectContaining({ toPublicId: "AF-000001", reason: "merged" }),
      })
    );
  });

  it("juge la paire contre les lignes relues dans la transaction", async () => {
    const readInTx = new Date("2026-07-24T12:00:00Z");
    stub(
      affair({
        id: "pub",
        slug: "publiee",
        publicationStatus: "PUBLISHED",
        updatedAt: readInTx,
      }),
      draftAffair({ updatedAt: readInTx })
    );

    await absorbDraftIntoPublished({ publishedId: "pub", draftId: "draft", ...base });

    const args = tx.affairPairDecision.upsert.mock.calls[0]![0];
    expect(args.create).toMatchObject({
      classification: "DUPLICATE",
      affairAUpdatedAt: readInTx,
      affairBUpdatedAt: readInTx,
      mergedIntoAffairId: "pub",
    });
  });

  it("ne propose rien quand le brouillon n'ajoute aucune valeur", async () => {
    stub(publishedAffair(), draftAffair({ status: null, court: null }));

    const result = await absorbDraftIntoPublished({
      publishedId: "pub",
      draftId: "draft",
      ...base,
    });

    expect(result.proposalsCreated).toBe(0);
    expect(tx.affairUpdateProposal.create).not.toHaveBeenCalled();
    expect(tx.affair.delete).toHaveBeenCalled();
  });

  it("garde trace des différences ni transférées ni proposables", async () => {
    stub(publishedAffair(), draftAffair({ category: "RECEL", title: "Titre du brouillon" }));

    const result = await absorbDraftIntoPublished({
      publishedId: "pub",
      draftId: "draft",
      ...base,
    });

    expect(result.recordedDifferences).toEqual(expect.arrayContaining(["title", "category"]));
    const notes = tx.auditLog.create.mock.calls[0]![0].data.changes.notes;
    expect(notes.recordedDifferences).toEqual(
      expect.arrayContaining([{ field: "category", absorbedValue: "RECEL" }])
    );
  });
});

describe("absorbDraftIntoPublished — refuse de se tromper de sens (#525)", () => {
  it("refuse si le survivant n'est pas publié", async () => {
    stub(affair({ id: "pub", publicationStatus: "DRAFT" }), draftAffair());

    await expect(
      absorbDraftIntoPublished({ publishedId: "pub", draftId: "draft", ...base })
    ).rejects.toThrow("n'est pas publiée");
    expect(tx.affair.delete).not.toHaveBeenCalled();
    expect(tx.affairUpdateProposal.create).not.toHaveBeenCalled();
  });

  it("refuse si l'affaire absorbée est publiée", async () => {
    stub(publishedAffair(), draftAffair({ publicationStatus: "PUBLISHED" }));

    await expect(
      absorbDraftIntoPublished({ publishedId: "pub", draftId: "draft", ...base })
    ).rejects.toThrow("n'est pas un brouillon");
    expect(tx.affair.delete).not.toHaveBeenCalled();
  });

  it("refuse si une des deux affaires a disparu", async () => {
    tx.affair.findUnique.mockResolvedValue(null);

    await expect(
      absorbDraftIntoPublished({ publishedId: "pub", draftId: "draft", ...base })
    ).rejects.toThrow("introuvable");
    expect(tx.affair.delete).not.toHaveBeenCalled();
  });
});
