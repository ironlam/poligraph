import { describe, it, expect, vi, beforeEach } from "vitest";

// The lookup tries findUnique (slug, id, externalId) then findFirst (number).
const findUnique = vi.fn();
const findFirst = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    legislativeDossier: { findUnique: () => findUnique(), findFirst: () => findFirst() },
    legislativeDossierAlias: { findFirst: vi.fn().mockResolvedValue(null) },
  },
}));
vi.mock("@/lib/data/dossier-amendments", () => ({
  getAmendmentStats: vi.fn(async () => null),
  getCuratedAmendments: vi.fn(async () => []),
}));

import { generateMetadata } from "@/app/parlement/dossiers/[slug]/page";

const metadataFor = (slug: string) => generateMetadata({ params: Promise.resolve({ slug }) });

beforeEach(() => {
  findUnique.mockReset();
  findFirst.mockReset();
  findFirst.mockResolvedValue(null);
});

describe("/parlement/dossiers/[slug] metadata", () => {
  it("noindex un dossier inexistant au lieu de l'offrir à l'indexation", async () => {
    findUnique.mockResolvedValue(null);

    const m = await metadataFor("x-bidon");

    expect(m.title).toBe("Dossier non trouvé");
    expect(m.robots).toEqual({ index: false, follow: true });
  });

  it("laisse intacte la metadata d'un dossier existant", async () => {
    findUnique.mockResolvedValue({
      slug: "dossier-reel",
      title: "Titre du dossier",
      summary: "Résumé du dossier législatif.",
      number: "PPL 3196",
      externalId: "DLR5L17N12345",
      aliases: [],
    });

    const m = await metadataFor("dossier-reel");

    expect(m.title).toBe("Titre du dossier");
    expect(m.description).toBe("Résumé du dossier législatif.");
    expect(m.alternates?.canonical).toBe("/parlement/dossiers/dossier-reel");
    expect(m.robots).toBeUndefined();
  });

  it("utilise le nom d’usage publié tout en conservant l’intitulé officiel", async () => {
    findUnique.mockResolvedValue({
      slug: "dossier-reel",
      title: "Proposition de loi visant à protéger les exploitations agricoles",
      summary: "Résumé du dossier législatif.",
      number: "PPL 123",
      externalId: "DLR5L17N12345",
      aliases: [{ label: "Loi Duplomb", isPreferred: true }],
    });

    const m = await metadataFor("dossier-reel");

    expect(m.title).toBe(
      "Loi Duplomb | Proposition de loi visant à protéger les exploitations agricoles"
    );
    expect(m.alternates?.canonical).toBe("/parlement/dossiers/dossier-reel");
  });
});
