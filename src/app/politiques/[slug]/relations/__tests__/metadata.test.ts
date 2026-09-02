import { describe, it, expect, vi, beforeEach } from "vitest";

// generateMetadata only reads the politician row and the index signals.
const findUnique = vi.fn();
vi.mock("@/lib/db", () => ({ db: { politician: { findUnique: () => findUnique() } } }));
vi.mock("@/lib/seo/politician-index-signals", () => ({
  getPoliticianIndexSignals: vi.fn(async () => null),
}));

import { generateMetadata } from "@/app/politiques/[slug]/relations/page";

const metadataFor = (slug: string) => generateMetadata({ params: Promise.resolve({ slug }) });

beforeEach(() => findUnique.mockReset());

describe("/politiques/[slug]/relations metadata", () => {
  it("noindex un profil inexistant au lieu de l'offrir à l'indexation", async () => {
    findUnique.mockResolvedValue(null);

    const m = await metadataFor("x-bidon");

    expect(m.title).toBe("Non trouvé");
    expect(m.robots).toEqual({ index: false, follow: true });
  });

  it("laisse intacte la metadata d'un profil existant", async () => {
    findUnique.mockResolvedValue({
      id: "p1",
      slug: "jean-dupont",
      fullName: "Jean Dupont",
      photoUrl: null,
      currentParty: null,
    });

    const m = await metadataFor("jean-dupont");

    expect(m.title).toBe("Relations de Jean Dupont | Poligraph");
    expect(m.description).toContain("Jean Dupont");
    expect(m.alternates?.canonical).toBe("/politiques/jean-dupont/relations");
    expect(m.robots).toBeUndefined();
  });
});
