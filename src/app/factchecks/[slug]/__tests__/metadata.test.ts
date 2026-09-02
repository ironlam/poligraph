import { describe, it, expect, vi, beforeEach } from "vitest";

const findFirst = vi.fn();
vi.mock("@/lib/db", () => ({ db: { factCheck: { findFirst: () => findFirst() } } }));
vi.mock("next/cache", () => ({ cacheTag: vi.fn(), cacheLife: vi.fn() }));

import { generateMetadata } from "@/app/factchecks/[slug]/page";

const metadataFor = (slug: string) => generateMetadata({ params: Promise.resolve({ slug }) });

beforeEach(() => findFirst.mockReset());

describe("/factchecks/[slug] metadata", () => {
  it("noindex un fact-check inexistant au lieu de l'offrir à l'indexation", async () => {
    findFirst.mockResolvedValue(null);

    const m = await metadataFor("x-bidon");

    expect(m.title).toBe("Fact-check non trouvé");
    expect(m.robots).toEqual({ index: false, follow: true });
  });

  it("laisse intacte la metadata d'un fact-check existant", async () => {
    findFirst.mockResolvedValue({
      slug: "factcheck-reel",
      title: "Un fact-check publié",
      claimant: "Jean Dupont",
      claimText: "Une affirmation à vérifier.",
      verdictRating: "FALSE",
      mentions: [],
    });

    const m = await metadataFor("factcheck-reel");

    expect(m.title).toBe("Un fact-check publié");
    expect(m.description).toContain("Jean Dupont");
    expect(m.alternates?.canonical).toBe("/factchecks/factcheck-reel");
    expect(m.robots).toBeUndefined();
  });
});
