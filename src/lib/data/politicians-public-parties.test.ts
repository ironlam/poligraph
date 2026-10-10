import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  db: {
    politician: { findUnique: vi.fn() },
  },
}));

import { db } from "@/lib/db";
import { readPoliticianDossier, readPoliticianIdentity } from "./politician-profile-reads";

/**
 * The profile read is split in two (identity above the fold, dossier in the tab bodies) and the
 * "a party with no public member is not nameable" invariant has to hold on BOTH halves. Splitting
 * the read without splitting this test would have left the affairs half unguarded.
 */
describe("lectures de fiche, frontières des partis non publics", () => {
  beforeEach(() => vi.clearAllMocks());

  it("neutralise les partis non publics des mandats et de l'historique (identité)", async () => {
    vi.mocked(db.politician.findUnique).mockResolvedValue({
      id: "politician-public",
      slug: "alice-publique",
      fullName: "Alice Publique",
      currentParty: { id: "current-party", name: "Parti actuel public" },
      _count: { affairs: 2, factCheckMentions: 5 },
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
      declarations: [],
      externalIds: [],
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
    } as never);

    const politician = await readPoliticianIdentity({ slug: "alice-publique" });

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
    expect(JSON.stringify(politician)).not.toContain("Ancien parti DRAFT");
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

  it("compte les affaires et les fact-checks sous les mêmes prédicats publics (identité)", async () => {
    vi.mocked(db.politician.findUnique).mockResolvedValue({
      id: "politician-public",
      slug: "alice-publique",
      mandates: [],
      declarations: [],
      externalIds: [],
      partyHistory: [],
      _count: { affairs: 2, factCheckMentions: 5 },
    } as never);

    const politician = await readPoliticianIdentity({ slug: "alice-publique" });
    expect(politician?._count).toEqual({ affairs: 2, factCheckMentions: 5 });

    // The counters feed the SEO richness predicate. Counting rows the dossier read would not list
    // would make a bare profile look rich enough to index.
    const query = vi.mocked(db.politician.findUnique).mock.calls[0]?.[0] as {
      include: {
        _count: {
          select: {
            affairs: { where: Record<string, unknown> };
            factCheckMentions: { where: Record<string, unknown> };
          };
        };
      };
    };
    expect(query.include._count.select.affairs.where).toMatchObject({
      politician: { publicationStatus: "PUBLISHED" },
    });
    expect(query.include._count.select.factCheckMentions.where).toHaveProperty("factCheck");
  });

  it("neutralise le parti d'époque d'une affaire non public (dossier)", async () => {
    vi.mocked(db.politician.findUnique).mockResolvedValue({
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
      factCheckMentions: [],
      dossierAuthors: [],
    } as never);

    const dossier = await readPoliticianDossier({ slug: "alice-publique" });

    expect(dossier?.affairs).toEqual([
      expect.objectContaining({
        id: "affair-public",
        title: "Affaire publique",
        partyAtTime: null,
      }),
    ]);
    expect(JSON.stringify(dossier)).not.toContain("Parti historique DRAFT");
    expect(JSON.stringify(dossier)).not.toContain("historical-party-draft");

    const query = vi.mocked(db.politician.findUnique).mock.calls[0]?.[0];
    expect(query).toMatchObject({
      where: { slug: "alice-publique", publicationStatus: "PUBLISHED" },
    });
  });

  it("rend null quand la personnalité n'est pas publique, sur les deux lectures", async () => {
    vi.mocked(db.politician.findUnique).mockResolvedValue(null as never);
    await expect(readPoliticianIdentity({ slug: "inconnue" })).resolves.toBeNull();
    await expect(readPoliticianDossier({ slug: "inconnue" })).resolves.toBeNull();
  });
});
