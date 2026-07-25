import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    affair: { findMany: vi.fn() },
    dismissedDuplicate: { findMany: vi.fn() },
    // Read by loadPairExclusions: detection now honours stored rulings (#525).
    affairPairDecision: { findMany: vi.fn() },
  },
}));

vi.mock("./matching", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./matching")>();
  return { ...actual, findMatchingAffairs: vi.fn() };
});

import { findPotentialDuplicates } from "./reconciliation";
import { db } from "@/lib/db";
import { findMatchingAffairs } from "./matching";
import { decideMergeAction } from "./merge-decision";

const mockedAffairFindMany = db.affair.findMany as ReturnType<typeof vi.fn>;
const mockedDismissedFindMany = db.dismissedDuplicate.findMany as ReturnType<typeof vi.fn>;
const mockedFindMatchingAffairs = findMatchingAffairs as ReturnType<typeof vi.fn>;
const mockedDecisionFindMany = db.affairPairDecision.findMany as ReturnType<typeof vi.fn>;

function makeDraft(
  id: string,
  overrides: Partial<{
    title: string;
    category: string;
    createdAt: Date;
    publicationStatus: string;
    politicianId: string;
    verifiedAt: Date | null;
    updatedAt: Date;
    involvement: string;
    factsDate: Date | null;
    verdictDate: Date | null;
  }> = {}
) {
  return {
    id,
    title: overrides.title ?? `Affaire ${id}`,
    ecli: null,
    pourvoiNumber: null,
    caseNumbers: [],
    category: overrides.category ?? "AUTRE",
    involvement: overrides.involvement ?? "DIRECT",
    factsDate: overrides.factsDate ?? null,
    verdictDate: overrides.verdictDate ?? null,
    politicianId: overrides.politicianId ?? "p1",
    createdAt: overrides.createdAt ?? new Date("2026-05-19T10:00:00Z"),
    publicationStatus: overrides.publicationStatus ?? "DRAFT",
    verifiedAt: overrides.verifiedAt ?? null,
    updatedAt: overrides.updatedAt ?? new Date("2026-05-19T10:00:00Z"),
    sources: [],
  };
}

describe("findPotentialDuplicates — draft window clustering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedDismissedFindMany.mockResolvedValue([]);
    mockedDecisionFindMany.mockResolvedValue([]);
    mockedFindMatchingAffairs.mockResolvedValue([]);
  });

  it("clusters same-politician drafts created within the window across sibling categories", async () => {
    // Scénario type cluster Philippe : titres divergents, catégories sœurs, créés à quelques jours
    mockedAffairFindMany.mockResolvedValue([
      makeDraft("a1", {
        title: "Affaire de gestion présumée illégale au Havre",
        category: "DETOURNEMENT_FONDS_PUBLICS",
        createdAt: new Date("2026-05-19T19:14:00Z"),
      }),
      makeDraft("a2", {
        title: "Enquête pour favoritisme dans l'attribution d'une convention",
        category: "FAVORITISME",
        createdAt: new Date("2026-05-20T12:15:00Z"),
      }),
      makeDraft("a3", {
        title: "Affaire Edouard Philippe au Havre",
        category: "AUTRE",
        createdAt: new Date("2026-05-26T05:09:00Z"),
      }),
    ]);

    const duplicates = await findPotentialDuplicates();

    // a1-a2 pair on the probity family. a1-a3 rests on the AUTRE wildcard but both
    // titles name Le Havre. a2-a3 rests on the wildcard and shares no vocabulary,
    // so it is dropped (issue #521) — the cluster stays reachable because a3 is
    // still connected through a1.
    const pairs = duplicates.map((d) => [d.affairA.id, d.affairB.id].sort().join("-")).sort();
    expect(pairs).toEqual(["a1-a2", "a1-a3"]);
    for (const pair of duplicates) {
      expect(pair.matchedBy).toBe("politician+category+window");
      expect(pair.confidence).toBe("POSSIBLE");
      expect(pair.score).toBe(0.45);
    }
  });

  it("does not pair drafts created more than 14 days apart", async () => {
    mockedAffairFindMany.mockResolvedValue([
      makeDraft("a1", { createdAt: new Date("2026-05-01T00:00:00Z") }),
      makeDraft("a2", { createdAt: new Date("2026-05-20T00:00:00Z") }),
    ]);

    const duplicates = await findPotentialDuplicates();

    expect(duplicates).toHaveLength(0);
  });

  it("does not pair drafts from incompatible category families", async () => {
    mockedAffairFindMany.mockResolvedValue([
      makeDraft("a1", { category: "MENACE" }),
      makeDraft("a2", { category: "FRAUDE_FISCALE" }),
    ]);

    const duplicates = await findPotentialDuplicates();

    expect(duplicates).toHaveLength(0);
  });

  it("ignores non-DRAFT affairs in the window pass", async () => {
    mockedAffairFindMany.mockResolvedValue([
      makeDraft("a1", { publicationStatus: "PUBLISHED" }),
      makeDraft("a2"),
    ]);

    const duplicates = await findPotentialDuplicates();

    expect(duplicates).toHaveLength(0);
  });

  it("does not pair drafts of different politicians", async () => {
    mockedAffairFindMany.mockResolvedValue([
      makeDraft("a1", { politicianId: "p1" }),
      makeDraft("a2", { politicianId: "p2" }),
    ]);

    const duplicates = await findPotentialDuplicates();

    expect(duplicates).toHaveLength(0);
  });

  it("respects dismissed pairs", async () => {
    mockedAffairFindMany.mockResolvedValue([makeDraft("a1"), makeDraft("a2")]);
    mockedDismissedFindMany.mockResolvedValue([{ affairIdA: "a1", affairIdB: "a2" }]);

    const duplicates = await findPotentialDuplicates();

    expect(duplicates).toHaveLength(0);
  });

  it("does not duplicate pairs already found by identifier matching", async () => {
    mockedAffairFindMany.mockResolvedValue([makeDraft("a1"), makeDraft("a2")]);
    mockedFindMatchingAffairs.mockResolvedValue([
      { affairId: "a1", confidence: "HIGH", score: 0.95, matchedBy: "pourvoiNumber" },
    ]);

    const duplicates = await findPotentialDuplicates();

    expect(duplicates).toHaveLength(1);
    expect(duplicates[0]!.matchedBy).toBe("pourvoiNumber");
  });
});

// Issue #525 — verifying an affair used to remove it from detection for good,
// which hid every duplicate involving a published fiche.
describe("findPotentialDuplicates — périmètre élargi (#525)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedDismissedFindMany.mockResolvedValue([]);
    mockedDecisionFindMany.mockResolvedValue([]);
    mockedFindMatchingAffairs.mockResolvedValue([]);
  });

  it("n'exclut plus les affaires vérifiées de la requête", async () => {
    mockedAffairFindMany.mockResolvedValue([]);

    await findPotentialDuplicates();

    const where = mockedAffairFindMany.mock.calls[0]![0].where;
    expect(where).toEqual({ publicationStatus: { in: ["DRAFT", "PUBLISHED"] } });
    expect(where).not.toHaveProperty("verifiedAt");
  });

  it("fait participer une affaire publiée et vérifiée à la détection", async () => {
    const verifiedPublished = makeDraft("pub", {
      publicationStatus: "PUBLISHED",
      verifiedAt: new Date("2026-01-01"),
      title: "Condamnation pour recel",
    });
    mockedAffairFindMany.mockResolvedValue([
      verifiedPublished,
      makeDraft("draft", { title: "Condamnation pour recel" }),
    ]);
    mockedFindMatchingAffairs.mockResolvedValue([
      { affairId: "pub", confidence: "HIGH", score: 0.95, matchedBy: "pourvoiNumber" },
    ]);

    const duplicates = await findPotentialDuplicates();

    expect(duplicates).toHaveLength(1);
    const summaries = [duplicates[0]!.affairA, duplicates[0]!.affairB];
    const published = summaries.find((s) => s.id === "pub")!;
    expect(published.publicationStatus).toBe("PUBLISHED");
    expect(published.verifiedAt).toEqual(new Date("2026-01-01"));
  });

  it("appelle le matcher une fois par affaire, pas une fois par paire", async () => {
    // 4 affaires d'une même personnalité : 6 paires, mais 4 appels suffisent.
    mockedAffairFindMany.mockResolvedValue([
      makeDraft("a1"),
      makeDraft("a2"),
      makeDraft("a3"),
      makeDraft("a4"),
    ]);

    await findPotentialDuplicates();

    expect(mockedFindMatchingAffairs).toHaveBeenCalledTimes(4);
  });

  it("passe excludeAffairId pour qu'une affaire ne se rapproche pas d'elle-même", async () => {
    mockedAffairFindMany.mockResolvedValue([makeDraft("a1"), makeDraft("a2")]);

    await findPotentialDuplicates();

    for (const call of mockedFindMatchingAffairs.mock.calls) {
      expect(call[0].excludeAffairId).toBeDefined();
    }
  });

  it("ignore un self-match même si le matcher en renvoie un", async () => {
    // Catégories de familles incompatibles, pour que seul le 1er passage joue.
    mockedAffairFindMany.mockResolvedValue([
      makeDraft("a1", { category: "MENACE" }),
      makeDraft("a2", { category: "FRAUDE_FISCALE" }),
    ]);
    mockedFindMatchingAffairs.mockImplementation(
      ({ excludeAffairId }: { excludeAffairId: string }) =>
        Promise.resolve([
          { affairId: excludeAffairId, confidence: "CERTAIN", score: 1, matchedBy: "ecli" },
        ])
    );

    const duplicates = await findPotentialDuplicates();

    expect(duplicates).toHaveLength(0);
  });

  it("ne remonte pas un faux positif déjà écarté", async () => {
    mockedAffairFindMany.mockResolvedValue([
      makeDraft("a1", { publicationStatus: "PUBLISHED" }),
      makeDraft("a2", { publicationStatus: "PUBLISHED" }),
    ]);
    mockedFindMatchingAffairs.mockResolvedValue([
      { affairId: "a1", confidence: "HIGH", score: 0.95, matchedBy: "pourvoiNumber" },
    ]);
    // Enregistré dans l'autre sens : la clé canonique doit quand même l'exclure.
    mockedDismissedFindMany.mockResolvedValue([{ affairIdA: "a2", affairIdB: "a1" }]);

    const duplicates = await findPotentialDuplicates();

    expect(duplicates).toHaveLength(0);
  });

  it("signale une contradiction de date de verdict sur la paire", async () => {
    mockedAffairFindMany.mockResolvedValue([
      makeDraft("a1", {
        publicationStatus: "PUBLISHED",
        verdictDate: new Date("2020-01-01"),
      }),
      makeDraft("a2", { verdictDate: new Date("2024-06-01") }),
    ]);
    mockedFindMatchingAffairs.mockResolvedValue([
      { affairId: "a1", confidence: "HIGH", score: 0.95, matchedBy: "pourvoiNumber" },
    ]);

    const duplicates = await findPotentialDuplicates();

    expect(duplicates[0]!.contradictions).toContain("verdictDate");
  });

  it("signale un involvement divergent comme non transférable", async () => {
    mockedAffairFindMany.mockResolvedValue([
      makeDraft("a1", { publicationStatus: "PUBLISHED", involvement: "MENTIONED_ONLY" }),
      makeDraft("a2", { involvement: "DIRECT" }),
    ]);
    mockedFindMatchingAffairs.mockResolvedValue([
      { affairId: "a1", confidence: "HIGH", score: 0.95, matchedBy: "pourvoiNumber" },
    ]);

    const duplicates = await findPotentialDuplicates();

    expect(duplicates[0]!.unpropagatableDifferences).toContain("involvement");
  });

  it("produit la même paire quel que soit le sens du rapprochement", async () => {
    mockedAffairFindMany.mockResolvedValue([makeDraft("zzz"), makeDraft("aaa")]);
    // Chaque côté rapproche l'autre, avec des scores différents : le meilleur gagne.
    mockedFindMatchingAffairs.mockImplementation(
      ({ excludeAffairId }: { excludeAffairId: string }) =>
        Promise.resolve(
          excludeAffairId === "zzz"
            ? [{ affairId: "aaa", confidence: "POSSIBLE", score: 0.3, matchedBy: "title-partial" }]
            : [{ affairId: "zzz", confidence: "HIGH", score: 0.95, matchedBy: "pourvoiNumber" }]
        )
    );

    const duplicates = await findPotentialDuplicates();

    expect(duplicates).toHaveLength(1);
    expect(duplicates[0]!.score).toBe(0.95);
    expect(duplicates[0]!.matchedBy).toBe("pourvoiNumber");
    // Ordre canonique : le plus petit id en A.
    expect(duplicates[0]!.affairA.id).toBe("aaa");
    expect(duplicates[0]!.affairB.id).toBe("zzz");
  });
});

// Issue #525 — a ruled pair must stop coming back, and must start coming back
// once the rows it was ruled against have changed.
describe("findPotentialDuplicates — jugements humains (#525)", () => {
  const ruledAt = new Date("2026-07-01T00:00:00Z");

  beforeEach(() => {
    vi.clearAllMocks();
    mockedDismissedFindMany.mockResolvedValue([]);
    mockedDecisionFindMany.mockResolvedValue([]);
    mockedFindMatchingAffairs.mockResolvedValue([
      { affairId: "a1", confidence: "HIGH", score: 0.95, matchedBy: "pourvoiNumber" },
    ]);
  });

  function pairOfPublished(updatedAt: Date) {
    return [
      { ...makeDraft("a1", { publicationStatus: "PUBLISHED" }), updatedAt },
      { ...makeDraft("a2", { publicationStatus: "PUBLISHED" }), updatedAt },
    ];
  }

  it("ne repropose pas une paire jugée distincte", async () => {
    mockedAffairFindMany.mockResolvedValue(pairOfPublished(ruledAt));
    mockedDecisionFindMany.mockResolvedValue([
      {
        pairKey: "a1:a2",
        affairIdA: "a1",
        affairIdB: "a2",
        classification: "DISTINCT",
        affairAUpdatedAt: ruledAt,
        affairBUpdatedAt: ruledAt,
      },
    ]);

    expect(await findPotentialDuplicates()).toHaveLength(0);
  });

  it("repropose une paire jugée distincte dont une fiche a changé depuis", async () => {
    const edited = new Date("2026-07-20T00:00:00Z");
    mockedAffairFindMany.mockResolvedValue([
      { ...makeDraft("a1", { publicationStatus: "PUBLISHED" }), updatedAt: edited },
      { ...makeDraft("a2", { publicationStatus: "PUBLISHED" }), updatedAt: ruledAt },
    ]);
    mockedDecisionFindMany.mockResolvedValue([
      {
        pairKey: "a1:a2",
        affairIdA: "a1",
        affairIdB: "a2",
        classification: "DISTINCT",
        affairAUpdatedAt: ruledAt,
        affairBUpdatedAt: ruledAt,
      },
    ]);

    const duplicates = await findPotentialDuplicates();

    expect(duplicates).toHaveLength(1);
    expect(duplicates[0]!.rulingStale).toBe(true);
    expect(duplicates[0]!.previousClassification).toBe("DISTINCT");
  });

  it("garde visible une paire différée en incertain", async () => {
    mockedAffairFindMany.mockResolvedValue(pairOfPublished(ruledAt));
    mockedDecisionFindMany.mockResolvedValue([
      {
        pairKey: "a1:a2",
        affairIdA: "a1",
        affairIdB: "a2",
        classification: "UNCERTAIN",
        affairAUpdatedAt: ruledAt,
        affairBUpdatedAt: ruledAt,
      },
    ]);

    const duplicates = await findPotentialDuplicates();

    expect(duplicates).toHaveLength(1);
    expect(duplicates[0]!.previousClassification).toBe("UNCERTAIN");
  });

  it("ne repropose pas une paire déjà fusionnée, même après modification", async () => {
    const edited = new Date("2026-07-20T00:00:00Z");
    mockedAffairFindMany.mockResolvedValue(pairOfPublished(edited));
    mockedDecisionFindMany.mockResolvedValue([
      {
        pairKey: "a1:a2",
        affairIdA: "a1",
        affairIdB: "a2",
        classification: "DUPLICATE",
        affairAUpdatedAt: ruledAt,
        affairBUpdatedAt: ruledAt,
      },
    ]);

    expect(await findPotentialDuplicates()).toHaveLength(0);
  });
});

// Issue #521 — the AUTRE wildcard pairs categories that share no family, so on its
// own it says nothing about the facts. The guard is scoped to the second pass:
// POSSIBLE only, no automatic merge, no data touched.
describe("findPotentialDuplicates — garde lexical du joker AUTRE (#521)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedDismissedFindMany.mockResolvedValue([]);
    mockedDecisionFindMany.mockResolvedValue([]);
    mockedFindMatchingAffairs.mockResolvedValue([]);
  });

  it("écarte une paire joker dont les titres ne partagent rien", async () => {
    // Forme du faux positif relevé au tri de #525 : une personnalité citée dans
    // deux couvertures sans rapport, dont l'une n'a pas de qualification.
    mockedAffairFindMany.mockResolvedValue([
      makeDraft("a1", {
        title: "Ordonnance du juge des référés sur les conditions de détention",
        category: "AUTRE",
      }),
      makeDraft("a2", { title: "Enlèvement suivi de meurtre", category: "AGRESSION_SEXUELLE" }),
    ]);

    expect(await findPotentialDuplicates()).toHaveLength(0);
  });

  it("garde une paire joker dont les titres partagent un mot porteur", async () => {
    // Ce que rien d'autre n'attrape : catégories de familles différentes, mêmes
    // faits, donc ni identifiant ni inclusion de titre ne les rapprochent.
    mockedAffairFindMany.mockResolvedValue([
      makeDraft("a1", {
        title: "Soupçons de tentative d'étouffement d'une procédure",
        category: "RECEL",
      }),
      makeDraft("a2", {
        title: "Tentative présumée d'étouffement d'une procédure",
        category: "AUTRE",
      }),
    ]);

    const duplicates = await findPotentialDuplicates();

    expect(duplicates).toHaveLength(1);
    expect(duplicates[0]!.confidence).toBe("POSSIBLE");
    expect(duplicates[0]!.score).toBe(0.45);
    expect(duplicates[0]!.matchedBy).toBe("politician+category+window");
  });

  it("ne demande rien aux titres quand les catégories sont identiques", async () => {
    mockedAffairFindMany.mockResolvedValue([
      makeDraft("a1", { title: "Menaces reçues au domicile", category: "MENACE" }),
      makeDraft("a2", { title: "Colis suspect découvert au bureau", category: "MENACE" }),
    ]);

    expect(await findPotentialDuplicates()).toHaveLength(1);
  });

  it("ne demande rien aux titres quand une famille nommée les rapproche", async () => {
    mockedAffairFindMany.mockResolvedValue([
      makeDraft("a1", { title: "Emplois familiaux au Parlement", category: "EMPLOI_FICTIF" }),
      makeDraft("a2", {
        title: "Marché public attribué sans mise en concurrence",
        category: "FAVORITISME",
      }),
    ]);

    expect(await findPotentialDuplicates()).toHaveLength(1);
  });

  it("conserve le comportement de AUTRE contre AUTRE", async () => {
    // Catégories égales : le joker n'est pas la raison du rapprochement.
    mockedAffairFindMany.mockResolvedValue([
      makeDraft("a1", { title: "Cyberattaques contre un parti", category: "AUTRE" }),
      makeDraft("a2", { title: "Signalement de violences psychologiques", category: "AUTRE" }),
    ]);

    expect(await findPotentialDuplicates()).toHaveLength(1);
  });

  it("n'écarte rien sur un rapprochement du premier passage", async () => {
    // Le garde est borné au 2e passage : un identifiant partagé n'est pas concerné.
    mockedAffairFindMany.mockResolvedValue([
      makeDraft("a1", { title: "Ordonnance de référé", category: "AUTRE" }),
      makeDraft("a2", { title: "Enlèvement suivi de meurtre", category: "AGRESSION_SEXUELLE" }),
    ]);
    mockedFindMatchingAffairs.mockResolvedValue([
      { affairId: "a1", confidence: "HIGH", score: 0.95, matchedBy: "pourvoiNumber" },
    ]);

    const duplicates = await findPotentialDuplicates();

    expect(duplicates).toHaveLength(1);
    expect(duplicates[0]!.matchedBy).toBe("pourvoiNumber");
  });

  it("n'introduit aucune paire auto-fusionnable", async () => {
    mockedAffairFindMany.mockResolvedValue([
      makeDraft("a1", {
        title: "Soupçons de tentative d'étouffement d'une procédure",
        category: "RECEL",
      }),
      makeDraft("a2", {
        title: "Tentative présumée d'étouffement d'une procédure",
        category: "AUTRE",
      }),
    ]);

    const duplicates = await findPotentialDuplicates();
    const plans = duplicates.map((d) => decideMergeAction(d).decision);

    expect(plans).toEqual(["REVIEW_REQUIRED"]);
  });

  it("ne change pas une décision AUTO_MERGE_DRAFTS existante", async () => {
    // Deux brouillons rapprochés en HIGH par un identifiant : le plan reste le même.
    mockedAffairFindMany.mockResolvedValue([makeDraft("a1"), makeDraft("a2")]);
    mockedFindMatchingAffairs.mockResolvedValue([
      { affairId: "a1", confidence: "HIGH", score: 0.95, matchedBy: "pourvoiNumber" },
    ]);

    const duplicates = await findPotentialDuplicates();

    expect(duplicates).toHaveLength(1);
    expect(decideMergeAction(duplicates[0]!).decision).toBe("AUTO_MERGE_DRAFTS");
  });
});
