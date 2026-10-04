import { describe, it, expect, vi, beforeEach } from "vitest";

// generateMetadata only reads the identity of the profile document. Stub Prisma so the module
// imports with no DATABASE_URL, and the cache primitives so nothing runs
// outside a Next request.
const getPoliticianIdentity = vi.fn();
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("next/cache", () => ({ cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("@/lib/data/politician-profile", () => ({
  getPoliticianProfile: async (slug: string) => {
    const identity = await getPoliticianIdentity(slug);
    return identity ? { identity } : null;
  },
  readProfileSnapshot: vi.fn(),
}));
vi.mock("@/lib/data/politician-candidacy", () => ({
  getPoliticianPresidentialCandidacy: vi.fn(async () => null),
}));

import { generateMetadata } from "@/app/politiques/[slug]/page";

const metadataFor = (slug: string) => generateMetadata({ params: Promise.resolve({ slug }) });

beforeEach(() => getPoliticianIdentity.mockReset());

describe("/politiques/[slug] metadata", () => {
  it("noindex un profil inexistant au lieu de l'offrir à l'indexation", async () => {
    getPoliticianIdentity.mockResolvedValue(null);

    const m = await metadataFor("x-bidon");

    expect(m.title).toBe("Politicien non trouvé");
    expect(m.robots).toEqual({ index: false, follow: true });
  });

  it("laisse intacte la metadata d'un profil existant", async () => {
    getPoliticianIdentity.mockResolvedValue({
      fullName: "Jean Dupont",
      photoUrl: null,
      biography: "Une biographie substantielle.",
      currentParty: { shortName: "XX" },
      mandates: [{ type: "DEPUTE", isCurrent: true, localData: null }],
      declarations: [{ type: "INTERETS", details: null }],
      // The robots predicate reads these as counters now, not as lists: the identity read counts
      // the affairs and fact-checks instead of loading them onto the critical path.
      _count: { affairs: 1, factCheckMentions: 1 },
    });

    const m = await metadataFor("jean-dupont");

    expect(m.title).toBe("Jean Dupont");
    expect(m.alternates?.canonical).toBe("/politiques/jean-dupont");
    expect(m.robots).not.toEqual({ index: false, follow: true });
  });
});
