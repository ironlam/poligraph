import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    $queryRaw: vi.fn(),
    politician: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

import { db } from "@/lib/db";
import { searchPoliticians } from "./search";

const FTS_ROW = {
  id: "published-1",
  slug: "published-person",
  fullName: "Personne Publiée",
  firstName: "Personne",
  lastName: "Publiée",
  photoUrl: null,
  currentPartyId: null,
  relevance: 1,
};

const HYDRATED_ROW = {
  id: "published-1",
  slug: "published-person",
  fullName: "Personne Publiée",
  firstName: "Personne",
  lastName: "Publiée",
  photoUrl: null,
  currentParty: null,
  mandates: [],
  _count: { affairs: 0 },
};

describe("public search publication contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("locks the FTS SQL and hydration to PUBLISHED politicians and affairs", async () => {
    vi.mocked(db.$queryRaw).mockResolvedValue([FTS_ROW] as never);
    vi.mocked(db.politician.findMany).mockResolvedValue([HYDRATED_ROW] as never);

    const result = await searchPoliticians({ query: "publiée" });

    expect(result.total).toBe(1);
    expect(db.$queryRaw).toHaveBeenCalledTimes(1);

    const template = vi.mocked(db.$queryRaw).mock.calls[0]?.[0] as unknown as readonly string[];
    const sql = Array.from(template).join("?");
    expect(sql).toContain(`p."publicationStatus" = 'PUBLISHED'`);

    expect(db.politician.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: { in: ["published-1"] },
          publicationStatus: "PUBLISHED",
        },
        select: expect.objectContaining({
          _count: {
            select: {
              affairs: { where: { publicationStatus: "PUBLISHED" } },
            },
          },
        }),
      })
    );
  });

  it("locks the non-FTS public search and affair count to PUBLISHED", async () => {
    vi.mocked(db.politician.findMany).mockResolvedValue([] as never);
    vi.mocked(db.politician.count).mockResolvedValue(0);

    await searchPoliticians({ query: "" });

    expect(db.politician.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [{ publicationStatus: "PUBLISHED" }],
        },
        select: expect.objectContaining({
          _count: {
            select: {
              affairs: { where: { publicationStatus: "PUBLISHED" } },
            },
          },
        }),
      })
    );
    expect(db.politician.count).toHaveBeenCalledWith({
      where: { AND: [{ publicationStatus: "PUBLISHED" }] },
    });
  });
});
