import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    election: { findUnique: vi.fn() },
    candidacy: { findMany: vi.fn() },
    pressArticle: { findMany: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("@/lib/measures/transitions", () => ({ createMeasure: vi.fn() }));
vi.mock("@/services/promises/extractor", () => ({ extractPromisesFromText: vi.fn() }));
vi.mock("@/services/promises/theme-classifier", () => ({
  classifyPresidentialTheme: vi.fn(),
  classifyTheme: vi.fn(),
}));

import { db } from "@/lib/db";
import { createMeasure } from "@/lib/measures/transitions";
import { ingestMeasuresFromPress } from "@/services/measures/press-ingest";
import { extractPromisesFromText } from "@/services/promises/extractor";
import { classifyPresidentialTheme, classifyTheme } from "@/services/promises/theme-classifier";

const ARTICLE = {
  id: "art-1",
  url: "https://example.org/article",
  title: "Le candidat annonce un encadrement des loyers",
  description: "Il promet d'encadrer les loyers dans les zones tendues.",
  publishedAt: new Date("2026-11-02T00:00:00Z"),
  feedSource: "Le Monde",
  mentions: [{ politicianId: "pol-1", politician: { fullName: "Alix Démonstration" } }],
};

function arrange(over: { candidacies?: unknown[]; articles?: unknown[] } = {}) {
  vi.mocked(db.election.findUnique).mockResolvedValue({
    id: "elec-1",
    slug: "presidentielle-2027",
  } as never);
  vi.mocked(db.candidacy.findMany).mockResolvedValue(
    (over.candidacies ?? [{ id: "cand-1", politicianId: "pol-1" }]) as never
  );
  vi.mocked(db.pressArticle.findMany).mockResolvedValue((over.articles ?? [ARTICLE]) as never);
  vi.mocked(extractPromisesFromText).mockResolvedValue([
    { text: "Encadrer les loyers dans les zones tendues.", context: null, confidence: 0.7 },
  ] as never);
  vi.mocked(classifyPresidentialTheme).mockResolvedValue({
    theme: "LOGEMENT_URBANISME",
    confidence: 0.8,
    method: "haiku",
  } as never);
  vi.mocked(createMeasure).mockResolvedValue({ measureId: "m-1", revisionId: "rev-1" } as never);
}

beforeEach(() => vi.clearAllMocks());

describe("ingestMeasuresFromPress", () => {
  it("crée une mesure en brouillon, avec sa révision et sa source de presse", async () => {
    arrange();

    const result = await ingestMeasuresFromPress({ electionId: "elec-1" });

    expect(result.created).toBe(1);
    expect(classifyPresidentialTheme).toHaveBeenCalledWith(
      "Encadrer les loyers dans les zones tendues."
    );
    expect(classifyTheme).not.toHaveBeenCalled();
    expect(createMeasure).toHaveBeenCalledWith(
      expect.objectContaining({
        politicianId: "pol-1",
        electionId: "elec-1",
        candidacyId: "cand-1",
        attribution: "PERSONAL",
        theme: "LOGEMENT_URBANISME",
        revision: expect.objectContaining({
          extractionMethod: "AI_ASSISTED",
          // La méthode du classifieur est conservée en version d'extracteur.
          extractorVersion: "haiku",
          // Aucune précision devinée depuis le texte : c'est une conclusion éditoriale.
          precision: null,
        }),
        sources: [
          expect.objectContaining({
            sourceKind: "ARTICLE_PRESSE",
            // La presse rapporte ce que le candidat a dit : secondaire par définition.
            tier: "SECONDARY",
            url: "https://example.org/article",
          }),
        ],
      })
    );
  });

  it("ignore une mention dont le politicien n'est pas candidat, et le compte", async () => {
    // Une mesure appartient à une campagne, et un article de presse ne dit pas laquelle. Rattacher la
    // mention à une élection que personne n'a choisie serait une affirmation inventée.
    arrange({ candidacies: [] });

    const result = await ingestMeasuresFromPress({ electionId: "elec-1" });

    expect(result.skippedNotCandidate).toBe(1);
    expect(result.created).toBe(0);
    expect(createMeasure).not.toHaveBeenCalled();
  });

  it("n'écrit rien en essai à blanc, et ne marque pas l'article", async () => {
    arrange();

    const result = await ingestMeasuresFromPress({ electionId: "elec-1", dryRun: true });

    expect(result.extracted).toBe(1);
    expect(result.created).toBe(0);
    expect(createMeasure).not.toHaveBeenCalled();
    expect(db.pressArticle.update).not.toHaveBeenCalled();
  });

  it("refuse une élection inconnue au lieu d'écrire n'importe où", async () => {
    vi.mocked(db.election.findUnique).mockResolvedValue(null as never);

    await expect(ingestMeasuresFromPress({ electionId: "inconnue" })).rejects.toThrow(
      /introuvable/
    );
    expect(db.pressArticle.findMany).not.toHaveBeenCalled();
  });

  it("marque l'article en erreur sans interrompre le lot", async () => {
    arrange();
    vi.mocked(createMeasure).mockRejectedValueOnce(new Error("connexion perdue"));

    const result = await ingestMeasuresFromPress({ electionId: "elec-1" });

    expect(result.created).toBe(0);
    expect(db.pressArticle.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ promiseScanStatus: "error" }) })
    );
  });

  it("n'écrit pas quand la taxonomie présidentielle ne peut pas être déterminée", async () => {
    arrange();
    vi.mocked(classifyPresidentialTheme).mockResolvedValueOnce(null);

    const result = await ingestMeasuresFromPress({ electionId: "elec-1" });

    expect(result.created).toBe(0);
    expect(createMeasure).not.toHaveBeenCalled();
    expect(db.pressArticle.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ promiseScanStatus: "error" }) })
    );
  });

  it("termine toutes les classifications avant de créer la première mesure", async () => {
    arrange();
    vi.mocked(extractPromisesFromText).mockResolvedValueOnce([
      { text: "Augmenter le SMIC.", context: null, confidence: 0.8 },
      { text: "Réformer les retraites.", context: null, confidence: 0.8 },
    ] as never);
    vi.mocked(classifyPresidentialTheme)
      .mockResolvedValueOnce({
        theme: "EMPLOI_TRAVAIL",
        confidence: 0.9,
        method: "haiku",
      })
      .mockResolvedValueOnce(null);

    const result = await ingestMeasuresFromPress({ electionId: "elec-1" });

    expect(result.extracted).toBe(2);
    expect(result.created).toBe(0);
    expect(createMeasure).not.toHaveBeenCalled();
    expect(db.pressArticle.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ promiseScanStatus: "error" }) })
    );
  });

  it("marque « skipped » un article sans extraction", async () => {
    arrange();
    vi.mocked(extractPromisesFromText).mockResolvedValue([] as never);

    await ingestMeasuresFromPress({ electionId: "elec-1" });

    expect(db.pressArticle.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ promiseScanStatus: "skipped" }) })
    );
  });
});
