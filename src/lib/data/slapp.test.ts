import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  count: vi.fn(),
  groupBy: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    affair: {
      findMany: mocks.findMany,
      count: mocks.count,
      groupBy: mocks.groupBy,
    },
  },
}));

import { getSlappAffairs, getSlappStats } from "./slapp";

describe("getSlappAffairs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ne retourne que les procédures-bâillons liées à une personnalité publique", async () => {
    mocks.findMany.mockImplementation(async (args: { where?: unknown }) => {
      const serialized = JSON.stringify(args.where);
      const publicBoundary =
        serialized.includes('"publicationStatus":"PUBLISHED"') &&
        serialized.includes('"politician":{"publicationStatus":"PUBLISHED"}');
      const slappBoundary = serialized.includes('"isSlapp":true');
      return publicBoundary && slappBoundary
        ? ([
            {
              id: "public-slapp",
              title: "Procédure-bâillon publique",
              politician: { slug: "personnalite-publique" },
            },
          ] as never)
        : ([
            { id: "public-slapp", title: "Procédure-bâillon publique" },
            { id: "draft-politician", title: "Affaire liée à une personnalité DRAFT" },
            { id: "not-slapp", title: "Affaire publique hors SLAPP" },
          ] as never);
    });

    const affairs = await getSlappAffairs({});

    expect(affairs).toEqual([
      expect.objectContaining({ id: "public-slapp", title: "Procédure-bâillon publique" }),
    ]);
    expect(JSON.stringify(affairs)).not.toContain("personnalité DRAFT");
    expect(JSON.stringify(affairs)).not.toContain("hors SLAPP");
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isSlapp: true,
          publicationStatus: "PUBLISHED",
          politician: { publicationStatus: "PUBLISHED" },
        }),
      })
    );
  });

  it("limite la sortie via take", async () => {
    mocks.findMany.mockResolvedValue([]);
    await getSlappAffairs({ limit: 5 });
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 5 }));
  });
});

describe("getSlappStats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retourne un total et le breakdown par status", async () => {
    mocks.count.mockResolvedValue(12);
    mocks.groupBy.mockResolvedValue([
      { status: "PROCES_EN_COURS", _count: { _all: 7 } } as never,
      { status: "RELAXE", _count: { _all: 5 } } as never,
    ]);
    const stats = await getSlappStats();
    expect(stats.total).toBe(12);
    expect(stats.byStatus.PROCES_EN_COURS).toBe(7);
    expect(stats.byStatus.RELAXE).toBe(5);
    for (const call of [mocks.count.mock.calls[0], mocks.groupBy.mock.calls[0]]) {
      expect(call?.[0]).toEqual(
        expect.objectContaining({
          where: expect.objectContaining({
            isSlapp: true,
            publicationStatus: "PUBLISHED",
            politician: { publicationStatus: "PUBLISHED" },
          }),
        })
      );
    }
  });
});
