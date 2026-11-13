import { describe, it, expect, vi, beforeEach } from "vitest";

const findMany = vi.fn().mockResolvedValue([]);
vi.mock("@/lib/db", () => ({
  db: { politician: { findMany: (...a: unknown[]) => findMany(...a) } },
}));
vi.mock("@/services/sync/prominence", () => ({ getExportProminenceScores: async () => new Map() }));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/export/politiques/route";

const call = (url: string) => GET(new NextRequest(url), { params: Promise.resolve({}) });

const ROW = {
  mandates: [],
  _count: { affairs: 0, factCheckMentions: 0 },
  externalIds: [],
  currentParty: null,
  civility: null,
  firstName: "First",
  lastName: "Last",
  fullName: "First Last",
  slug: "slug",
};

/** An inexhaustible table: every page comes back full, so only the cap can stop the read. */
const fullPages = async ({ take }: { take: number }) => Array.from({ length: take }, () => ROW);

/** Rows requested over the whole export, all pages added up. */
const rowsRequested = () =>
  findMany.mock.calls.reduce((sum, [args]) => sum + (args as { take: number }).take, 0);

describe("plafond de l'export politiques", () => {
  beforeEach(() => {
    findMany.mockReset();
    findMany.mockResolvedValue([]);
  });

  it("bounds the query instead of scanning the whole table", async () => {
    findMany.mockImplementation(fullPages);
    await call("https://poligraph.fr/api/export/politiques");
    expect(rowsRequested()).toBe(50000);
  });

  it("never asks for more than one page of politicians in a single query", async () => {
    // One query for the whole export bound one parameter per politician on the nested reads and
    // failed with P2029 past 32 767 published profiles.
    findMany.mockImplementation(fullPages);
    await call("https://poligraph.fr/api/export/politiques");
    expect(findMany.mock.calls.length).toBeGreaterThan(1);
    for (const [args] of findMany.mock.calls) {
      expect((args as { take: number }).take).toBeLessThanOrEqual(5000);
    }
  });

  it("honours a smaller limit from the caller", async () => {
    await call("https://poligraph.fr/api/export/politiques?limit=10");
    expect(findMany.mock.calls[0]![0]).toMatchObject({ take: 10 });
  });

  it("never lets a caller raise the cap", async () => {
    findMany.mockImplementation(fullPages);
    await call("https://poligraph.fr/api/export/politiques?limit=999999");
    expect(rowsRequested()).toBe(50000);
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

  it("stays quiet when a caller-supplied limit is simply filled", async () => {
    findMany.mockResolvedValue(
      Array.from({ length: 50 }, () => ({
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
    await call("https://poligraph.fr/api/export/politiques?limit=50");
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
