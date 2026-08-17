import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  partyFindFirst: vi.fn(),
  factCheckFindFirst: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("next/og", () => ({ ImageResponse: class ImageResponse {} }));
vi.mock("@/lib/db", () => ({
  db: {
    party: { findFirst: mocks.partyFindFirst },
    factCheck: { findFirst: mocks.factCheckFindFirst },
  },
}));

import PartyOgImage from "@/app/partis/[slug]/opengraph-image";
import FactCheckOgImage from "@/app/factchecks/[slug]/opengraph-image";

describe("images Open Graph du contrat public MCP", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.partyFindFirst.mockResolvedValue(null);
    mocks.factCheckFindFirst.mockResolvedValue(null);
  });

  it("répond par notFound pour un parti non public", async () => {
    await expect(
      PartyOgImage({ params: Promise.resolve({ slug: "parti-draft-only" }) })
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(mocks.partyFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          slug: "parti-draft-only",
          politicians: { some: { publicationStatus: "PUBLISHED" } },
        },
      })
    );
  });

  it("répond par notFound pour un fact-check DRAFT ou issu d'une source non autorisée", async () => {
    await expect(
      FactCheckOgImage({ params: Promise.resolve({ slug: "factcheck-non-public" }) })
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(mocks.factCheckFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          slug: "factcheck-non-public",
          publicationStatus: "PUBLISHED",
          source: expect.objectContaining({ in: expect.any(Array) }),
        }),
      })
    );
  });
});
