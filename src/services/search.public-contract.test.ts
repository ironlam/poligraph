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

import { Prisma, MandateType } from "@/generated/prisma";
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
  it("searches by name and preserves public filters when the FTS column is absent", async () => {
    const driverAdapterError = new Error("ColumnNotFound", {
      cause: { kind: "ColumnNotFound", column: "p.searchVector" },
    });
    vi.mocked(db.$queryRaw).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("FTS column missing", {
        code: "P2010",
        clientVersion: "7.10.1",
        meta: { driverAdapterError },
      })
    );
    vi.mocked(db.politician.findMany).mockResolvedValue([HYDRATED_ROW] as never);
    vi.mocked(db.politician.count).mockResolvedValue(3);

    const result = await searchPoliticians(
      { query: "publiée", mandateType: MandateType.DEPUTE, hasAffairs: false },
      2,
      1
    );

    const where = {
      AND: [
        { publicationStatus: "PUBLISHED" },
        {
          OR: [
            { fullName: { contains: "publiée", mode: "insensitive" } },
            { lastName: { contains: "publiée", mode: "insensitive" } },
          ],
        },
        { mandates: { some: { type: MandateType.DEPUTE, isCurrent: true } } },
        { affairs: { none: { publicationStatus: "PUBLISHED" } } },
      ],
    };
    expect(db.politician.count).toHaveBeenCalledWith({ where });
    expect(db.politician.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where, skip: 1, take: 1 })
    );
    expect(result).toMatchObject({ total: 3, page: 2, totalPages: 3 });
    expect(result.results).toMatchObject([{ slug: HYDRATED_ROW.slug }]);
  });

  it("propagates other FTS errors", async () => {
    const error = new Error("Failed database connection");
    vi.mocked(db.$queryRaw).mockRejectedValue(error);
    await expect(searchPoliticians({ query: "publiée" })).rejects.toBe(error);
    expect(db.politician.findMany).not.toHaveBeenCalled();
  });
});
