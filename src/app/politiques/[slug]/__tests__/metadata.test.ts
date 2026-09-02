import { describe, it, expect, vi, beforeEach } from "vitest";

// generateMetadata only reads the politician row. Stub Prisma so the module
// imports with no DATABASE_URL, and the cache primitives so nothing runs
// outside a Next request.
const getPolitician = vi.fn();
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("next/cache", () => ({ cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("@/lib/data/politicians", () => ({
  getPolitician: (slug: string) => getPolitician(slug),
}));
vi.mock("@/lib/data/politician-candidacy", () => ({
  getPoliticianPresidentialCandidacy: vi.fn(async () => null),
}));

import { generateMetadata } from "@/app/politiques/[slug]/page";

const metadataFor = (slug: string) => generateMetadata({ params: Promise.resolve({ slug }) });

beforeEach(() => getPolitician.mockReset());

describe("/politiques/[slug] metadata", () => {
  it("noindex un profil inexistant au lieu de l'offrir à l'indexation", async () => {
    getPolitician.mockResolvedValue(null);

    const m = await metadataFor("x-bidon");

    expect(m.title).toBe("Politicien non trouvé");
    expect(m.robots).toEqual({ index: false, follow: true });
  });

  it("laisse intacte la metadata d'un profil existant", async () => {
    getPolitician.mockResolvedValue({
      fullName: "Jean Dupont",
      photoUrl: null,
      biography: "Une biographie substantielle.",
      currentParty: { shortName: "XX" },
      mandates: [{ type: "DEPUTE", isCurrent: true, localData: null }],
      declarations: [{ type: "INTERETS", details: null }],
      affairs: [{ id: "a1" }],
      factCheckMentions: [{ id: "f1" }],
    });

    const m = await metadataFor("jean-dupont");

    expect(m.title).toBe("Jean Dupont");
    expect(m.alternates?.canonical).toBe("/politiques/jean-dupont");
    expect(m.robots).not.toEqual({ index: false, follow: true });
  });
});
