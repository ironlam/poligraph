import { describe, it, expect, vi, beforeEach } from "vitest";

// The lookup goes through db.affair.findFirst three times (slug, old slug, id).
const findFirst = vi.fn();
vi.mock("@/lib/db", () => ({ db: { affair: { findFirst: () => findFirst() } } }));
vi.mock("next/cache", () => ({ cacheTag: vi.fn(), cacheLife: vi.fn() }));

import { generateMetadata } from "@/app/affaires/[slug]/page";

const metadataFor = (slug: string) => generateMetadata({ params: Promise.resolve({ slug }) });

beforeEach(() => findFirst.mockReset());

describe("/affaires/[slug] metadata", () => {
  it("noindex une affaire inexistante au lieu de l'offrir à l'indexation", async () => {
    findFirst.mockResolvedValue(null);

    const m = await metadataFor("x-bidon");

    expect(m.title).toBe("Affaire non trouvée");
    expect(m.robots).toEqual({ index: false, follow: true });
  });

  it("laisse intacte la metadata d'une affaire existante", async () => {
    findFirst.mockResolvedValueOnce({
      slug: "affaire-reelle",
      title: "Affaire réelle",
      description: "Description de l'affaire.",
      involvement: "TEMOIN",
      fineAmount: null,
      partyAtTime: null,
      politician: { fullName: "Jean Dupont", slug: "jean-dupont" },
    });

    const m = await metadataFor("affaire-reelle");

    expect(m.title).toBe("Affaire réelle");
    expect(m.description).toBe("Description de l'affaire.");
    expect(m.alternates?.canonical).toBe("/affaires/affaire-reelle");
    expect(m.robots).toBeUndefined();
  });
});
