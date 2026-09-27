import { beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted: `vi.mock` factories run before the module body, so the spies cannot be plain consts.
const mocks = vi.hoisted(() => ({
  getPoliticianDossier: vi.fn(),
  getProfileVoteStats: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
const { getPoliticianDossier, notFound } = mocks;

vi.mock("server-only", () => ({}));
// The component tree reaches `@/lib/data/scrutins`, which builds the Prisma client at import time.
// The unit CI job has no DATABASE_URL, so the import alone would throw before any test runs.
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/lib/data/politicians", () => ({ getPoliticianDossier: mocks.getPoliticianDossier }));
vi.mock("../vote-stats", () => ({ getProfileVoteStats: mocks.getProfileVoteStats }));

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
 * The profile read is split in two. The identity half can be a warm cache entry describing a
 * profile that the dossier half no longer finds public, and the empty fallback that case invites
 * is not survivable: it renders a clean profile for someone who has a judicial record, drops the
 * Fact-checks tab from the bar, and lets `generateMetadata` keep counting the affairs it no longer
 * shows. That page is then cached for 24h under `revalidate = 86400`.
 */
describe("PoliticianProfileBody, dossier introuvable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    notFound.mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });
  });

  it("fait un 404 au lieu de rendre une fiche vide", async () => {
    getPoliticianDossier.mockResolvedValue(null);

    await expect(
      PoliticianProfileBody({
        politician: IDENTITY,
        mandateType: null,
        currentParliamentaryMandate: null,
        currentGroup: null,
        isActiveParliamentarian: false,
        isChamberPresident: false,
      })
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(notFound).toHaveBeenCalledOnce();
  });

  it("ne fait pas de 404 quand le dossier est simplement vide", async () => {
    getPoliticianDossier.mockResolvedValue({
      affairs: [],
      factCheckMentions: [],
      dossierAuthors: [],
    });

    await expect(
      PoliticianProfileBody({
        politician: IDENTITY,
        mandateType: null,
        currentParliamentaryMandate: null,
        currentGroup: null,
        isActiveParliamentarian: false,
        isChamberPresident: false,
      })
    ).resolves.toBeTruthy();

    expect(notFound).not.toHaveBeenCalled();
  });
});
