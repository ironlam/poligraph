import { describe, it, expect, vi, beforeEach } from "vitest";

// The lookup tries findUnique (slug, id, externalId) then findFirst.
const findUnique = vi.fn();
const findFirst = vi.fn();
vi.mock("@/lib/db", () => ({
  db: { scrutin: { findUnique: () => findUnique(), findFirst: () => findFirst() } },
}));

import { generateMetadata } from "@/app/parlement/votes/[slug]/page";

const metadataFor = (slug: string) => generateMetadata({ params: Promise.resolve({ slug }) });

beforeEach(() => {
  findUnique.mockReset();
  findFirst.mockReset();
  findFirst.mockResolvedValue(null);
});

describe("/parlement/votes/[slug] metadata", () => {
  it("noindex un scrutin inexistant au lieu de l'offrir à l'indexation", async () => {
    findUnique.mockResolvedValue(null);

    const m = await metadataFor("x-bidon");

    expect(m.title).toBe("Scrutin non trouvé");
    expect(m.robots).toEqual({ index: false, follow: true });
  });

  it("laisse intacte la metadata d'un scrutin existant", async () => {
    findUnique.mockResolvedValue({
      slug: "scrutin-reel",
      externalId: "VTANR5L17V5283",
      title: "Titre officiel du scrutin",
      chamber: "AN",
      type: "ORDINAIRE",
      result: "ADOPTED",
      votingDate: new Date("2026-03-04T00:00:00Z"),
      votesFor: 300,
      votesAgainst: 100,
      votesAbstain: 10,
      summary: "Un résumé du scrutin.",
      citizenImpact: null,
      policyTitle: null,
      importance: { isKeyVote: true },
      votes: [],
      dossierLegislatif: null,
    });

    const m = await metadataFor("scrutin-reel");

    expect(m.title).toBe("Scrutin n° 5283 Assemblée nationale - Titre officiel du scrutin");
    expect(m.description).toBe("Un résumé du scrutin.");
    expect(m.alternates?.canonical).toBe("/parlement/votes/scrutin-reel");
    expect(m.robots).not.toEqual({ index: false, follow: true });
  });

  it("laisse intacte la metadata d'une archive par date, sans requête", async () => {
    const m = await metadataFor("2026-03-04");

    expect(m.title).toBe("Votes du 4 mars 2026");
    expect(m.alternates?.canonical).toBe("/parlement/votes/2026-03-04");
    expect(findUnique).not.toHaveBeenCalled();
  });
});
