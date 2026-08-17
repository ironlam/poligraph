import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    politician: {
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    party: {
      findMany: vi.fn(),
    },
  },
}));

import { db } from "@/lib/db";
import { getPoliticians } from "@/services/politicians";

describe("getPoliticians public contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.politician.findMany).mockResolvedValue([]);
    vi.mocked(db.politician.count).mockResolvedValue(0);
  });

  it("filters hasAffairs=true on published affairs for a public collection", async () => {
    await getPoliticians({ publicationStatus: "PUBLISHED", hasAffairs: true });

    expect(db.politician.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          publicationStatus: "PUBLISHED",
          affairs: { some: { publicationStatus: "PUBLISHED" } },
        }),
      })
    );
    expect(db.politician.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          publicationStatus: "PUBLISHED",
          affairs: { some: { publicationStatus: "PUBLISHED" } },
        }),
      })
    );
  });

  it("filters hasAffairs=false against published affairs only", async () => {
    await getPoliticians({ publicationStatus: "PUBLISHED", hasAffairs: false });

    expect(db.politician.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          affairs: { none: { publicationStatus: "PUBLISHED" } },
        }),
      })
    );
  });

  it("does not change private admin semantics for a non-public collection", async () => {
    await getPoliticians({ publicationStatus: "DRAFT", hasAffairs: true });

    expect(db.politician.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          publicationStatus: "DRAFT",
          affairs: { some: {} },
        }),
      })
    );
  });
});
