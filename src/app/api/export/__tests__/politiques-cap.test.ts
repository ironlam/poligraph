import { describe, it, expect, vi, beforeEach } from "vitest";

const findMany = vi.fn().mockResolvedValue([]);
vi.mock("@/lib/db", () => ({
  db: { politician: { findMany: (...a: unknown[]) => findMany(...a) } },
}));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/export/politiques/route";

const call = (url: string) => GET(new NextRequest(url), { params: Promise.resolve({}) });

describe("plafond de l'export politiques", () => {
  beforeEach(() => {
    findMany.mockClear();
    findMany.mockResolvedValue([]);
  });

  it("bounds the query instead of scanning the whole table", async () => {
    await call("https://poligraph.fr/api/export/politiques");
    expect(findMany.mock.calls[0]![0]).toMatchObject({ take: 50000 });
  });

  it("honours a smaller limit from the caller", async () => {
    await call("https://poligraph.fr/api/export/politiques?limit=10");
    expect(findMany.mock.calls[0]![0]).toMatchObject({ take: 10 });
  });

  it("never lets a caller raise the cap", async () => {
    await call("https://poligraph.fr/api/export/politiques?limit=999999");
    expect(findMany.mock.calls[0]![0]).toMatchObject({ take: 50000 });
  });

  it("warns when the cap is reached, so truncation is never silent", async () => {
    findMany.mockResolvedValue(
      Array.from({ length: 50000 }, () => ({
        mandates: [],
        party: null,
        _count: { affairs: 0, factCheckMentions: 0 },
        externalIds: [],
        publicId: "id",
        slug: "slug",
        civility: "M.",
        firstName: "First",
        lastName: "Last",
        fullName: "First Last",
        birthDate: null,
        birthPlace: null,
        deathDate: null,
        currentParty: null,
        currentPartyId: null,
        prominenceScore: 0,
        blobPhotoUrl: null,
        photoUrl: null,
        publicationStatus: "PUBLISHED",
        createdAt: new Date(),
        updatedAt: new Date(),
      }))
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await call("https://poligraph.fr/api/export/politiques");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("plafond"));
    warn.mockRestore();
  });
});
