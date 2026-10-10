import { beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted: `vi.mock` factories run before the module body, so the spies cannot be plain consts.
const mocks = vi.hoisted(() => ({
  getPoliticianProfile: vi.fn(),
  getPoliticianPresidentialCandidacy: vi.fn(async () => null),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
const { getPoliticianProfile, notFound } = mocks;

vi.mock("server-only", () => ({}));
// The component tree reaches `@/lib/data/scrutins`, which builds the Prisma client at import time.
// The unit CI job has no DATABASE_URL, so the import alone would throw before any test runs.
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("next/cache", () => ({ cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("@/lib/feature-flags", () => ({ isFeatureEnabled: async () => false }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/lib/data/politician-profile", () => ({
  getPoliticianProfile: mocks.getPoliticianProfile,
  readProfileSnapshot: vi.fn(),
}));
vi.mock("@/lib/data/politician-candidacy", () => ({
  getPoliticianPresidentialCandidacy: mocks.getPoliticianPresidentialCandidacy,
  loadPoliticianPresidentialCandidacy: vi.fn(),
}));

import PoliticianPage from "../page";
import { PoliticianProfileBody } from "../_components/PoliticianProfileBody";

const IDENTITY = {
  id: "p1",
  slug: "alice-publique",
  fullName: "Alice Publique",
  mandates: [],
  declarations: [],
  externalIds: [],
  partyHistory: [],
  updatedAt: new Date("2026-01-01"),
} as never;

/**
 * The profile used to be read in two halves, and the identity half could be a warm cache entry
 * describing a profile that the dossier half no longer found public. The empty fallback that case
 * invites is not survivable: it renders a clean profile for someone who has a judicial record,
 * drops the Fact-checks tab from the bar, and lets `generateMetadata` keep counting the affairs it
 * no longer shows, cached for 24h under `revalidate = 86400`.
 *
 * The page now reads one document that carries both halves, so the only "dossier missing" case
 * left is the whole document missing, and that is a 404.
 */
describe("fiche politicien, dossier introuvable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    notFound.mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });
  });

  it("fait un 404 au lieu de rendre une fiche vide", async () => {
    getPoliticianProfile.mockResolvedValue(null);

    await expect(
      PoliticianPage({ params: Promise.resolve({ slug: "alice-publique" }) })
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(notFound).toHaveBeenCalledOnce();
  });

  it("ne fait pas de 404 quand le dossier est simplement vide", async () => {
    getPoliticianProfile.mockResolvedValue({
      identity: IDENTITY,
      dossier: { affairs: [], factCheckMentions: [], dossierAuthors: [] },
      voteStats: null,
      mandateType: null,
    });

    await expect(
      PoliticianPage({ params: Promise.resolve({ slug: "alice-publique" }) })
    ).resolves.toBeTruthy();
    expect(
      PoliticianProfileBody({
        politician: IDENTITY,
        dossier: { affairs: [], factCheckMentions: [], dossierAuthors: [] },
        voteStats: null,
        currentParliamentaryMandate: null,
        currentGroup: null,
        isActiveParliamentarian: false,
        isChamberPresident: false,
      })
    ).toBeTruthy();

    expect(notFound).not.toHaveBeenCalled();
  });
});
