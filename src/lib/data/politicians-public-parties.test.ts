import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: <T extends (...args: never[]) => unknown>(fn: T) => fn }));
vi.mock("next/cache", () => ({ cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    politician: { findUnique: vi.fn() },
  },
}));

import { db } from "@/lib/db";
import { getPolitician } from "./politicians";

describe("getPolitician, frontières des partis historiques", () => {
  beforeEach(() => vi.clearAllMocks());

  it("garde la personnalité et neutralise les partis non publics de ses relations", async () => {
    vi.mocked(db.politician.findUnique).mockResolvedValue({
      id: "politician-public",
      slug: "alice-publique",
      fullName: "Alice Publique",
      currentParty: { id: "current-party", name: "Parti actuel public" },
      mandates: [
        {
          id: "mandate-hidden-party",
          party: { name: "Parti de mandat DRAFT", _count: { politicians: 0 } },
        },
        {
          id: "mandate-public-party",
          party: { name: "Parti de mandat public", _count: { politicians: 1 } },
        },
      ],
      affairs: [
        {
          id: "affair-public",
          title: "Affaire publique",
          fineAmount: null,
          partyAtTime: {
            id: "historical-party-draft",
            name: "Parti historique DRAFT",
            slug: "historical-party-draft",
            _count: { politicians: 0 },
          },
        },
      ],
      declarations: [],
      factCheckMentions: [],
      partyHistory: [
        {
          id: "membership-hidden",
          party: {
            name: "Ancien parti DRAFT",
            shortName: "APD",
            slug: "ancien-parti-draft",
            color: "#111111",
            _count: { politicians: 0 },
          },
        },
        {
          id: "membership-public",
          party: {
            name: "Ancien parti public",
            shortName: "APP",
            slug: "ancien-parti-public",
            color: "#222222",
            _count: { politicians: 3 },
          },
        },
      ],
      externalIds: [],
      dossierAuthors: [],
    } as never);

    const politician = await getPolitician("alice-publique");

    expect(politician).not.toBeNull();
    expect(politician?.mandates).toEqual([
      expect.objectContaining({ id: "mandate-hidden-party", party: null }),
      expect.objectContaining({
        id: "mandate-public-party",
        party: { name: "Parti de mandat public" },
      }),
    ]);
    expect(politician?.partyHistory).toEqual([
      expect.objectContaining({
        id: "membership-public",
        party: {
          name: "Ancien parti public",
          shortName: "APP",
          slug: "ancien-parti-public",
          color: "#222222",
        },
      }),
    ]);
    expect(politician?.affairs).toEqual([
      expect.objectContaining({
        id: "affair-public",
        title: "Affaire publique",
        partyAtTime: null,
      }),
    ]);
    expect(JSON.stringify(politician)).not.toContain("Parti historique DRAFT");
    expect(JSON.stringify(politician)).not.toContain("ancien-parti-draft");

    const query = vi.mocked(db.politician.findUnique).mock.calls[0]?.[0];
    expect(query).toMatchObject({
      where: { slug: "alice-publique", publicationStatus: "PUBLISHED" },
      include: {
        mandates: {
          include: {
            party: {
              select: {
                _count: {
                  select: { politicians: { where: { publicationStatus: "PUBLISHED" } } },
                },
              },
            },
          },
        },
        partyHistory: {
          include: {
            party: {
              select: {
                _count: {
                  select: { politicians: { where: { publicationStatus: "PUBLISHED" } } },
                },
              },
            },
          },
        },
      },
    });
  });
});
