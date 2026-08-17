import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: <T extends (...args: never[]) => unknown>(fn: T) => fn }));
vi.mock("next/cache", () => ({ cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    platform: { findFirst: mocks.findFirst, findMany: mocks.findMany },
  },
}));

import { getPartyPlatform, getPartyPositionsForMatching, getPlatformsListing } from "./platforms";

function hasPublicParty(value: unknown): boolean {
  return JSON.stringify(value).includes('"politicians":{"some":{"publicationStatus":"PUBLISHED"}}');
}

const publicPlatform = {
  id: "platform-public",
  partyId: "party-public",
  publicationStatus: "PUBLISHED",
  party: {
    slug: "parti-public",
    name: "Parti public",
    shortName: "PP",
    color: "#123456",
    logoUrl: null,
  },
  proposals: [{ axis: "ECONOMIE", position: 1, verifiedBy: "editor" }],
};

const hiddenPlatform = {
  id: "platform-hidden",
  partyId: "party-draft",
  publicationStatus: "PUBLISHED",
  party: {
    slug: "parti-draft",
    name: "Parti DRAFT",
    shortName: "PD",
    color: "#654321",
    logoUrl: "https://example.test/draft.svg",
  },
  proposals: [{ axis: "ECONOMIE", position: -1, verifiedBy: "editor" }],
};

describe("programmes, frontière Party uniforme", () => {
  beforeEach(() => vi.clearAllMocks());

  it("ne retourne pas une plateforme publiée appartenant à un parti non public", async () => {
    mocks.findFirst.mockImplementation(async (args: { where?: Record<string, unknown> }) => {
      const slug = (args.where?.party as { slug?: string } | undefined)?.slug;
      if (slug === "parti-draft") return hasPublicParty(args) ? null : hiddenPlatform;
      return hasPublicParty(args) ? publicPlatform : null;
    });

    const hidden = await getPartyPlatform("parti-draft");
    const visible = await getPartyPlatform("parti-public");

    expect(hidden).toBeNull();
    expect(visible).toMatchObject({
      id: "platform-public",
      party: { slug: "parti-public", name: "Parti public" },
    });
    expect(JSON.stringify([hidden, visible])).not.toContain("Parti DRAFT");
    expect(JSON.stringify([hidden, visible])).not.toContain("draft.svg");
  });

  it("applique la même frontière à /programmes et au matching", async () => {
    mocks.findMany.mockImplementation(async (args: unknown) =>
      hasPublicParty(args) ? [publicPlatform] : [publicPlatform, hiddenPlatform]
    );

    const listing = await getPlatformsListing();
    const positions = await getPartyPositionsForMatching("election-1");

    expect(listing).toEqual([expect.objectContaining({ id: "platform-public" })]);
    expect(positions).toEqual([
      {
        party: expect.objectContaining({ slug: "parti-public", shortName: "PP" }),
        positions: { ECONOMIE: 1 },
      },
    ]);
    expect(JSON.stringify({ listing, positions })).not.toContain("platform-hidden");
    expect(JSON.stringify({ listing, positions })).not.toContain("parti-draft");
  });
});
