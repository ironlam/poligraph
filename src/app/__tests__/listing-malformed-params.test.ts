import { beforeEach, describe, expect, it, vi } from "vitest";
import { ElectionType, PoliticalPosition } from "@/generated/prisma";

/**
 * Regression guard for the production incident of 2026-09-01: an automated
 * scanner walked the listing pages with junk filter and pagination values, and
 * every one of them answered with an unhandled 500 raised by Prisma rather
 * than a listing with defaults applied.
 *
 * The loaders here are mocked to refuse the same arguments Prisma refuses, so
 * a page that lets a bad value through fails this suite instead of production.
 */

// Payloads lifted verbatim from the production access log.
const SQLI_PROBE = 'SENATORIALES") AND UPDATEXML(6619,CONCAT(0x2e),1)-- -';
const AFFAIRS_PAGE_SIZE = 20;

const mocks = vi.hoisted(() => ({
  getElections: vi.fn(),
  getTypeCounts: vi.fn(),
  getAffairs: vi.fn(),
  getParties: vi.fn(),
  getPartiesWithAffairs: vi.fn(),
  getPublicPartyMetadataBySlug: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/lib/data/elections", () => ({
  getElections: mocks.getElections,
  getTypeCounts: mocks.getTypeCounts,
}));
vi.mock("@/lib/data/affairs", () => ({
  getAffairs: mocks.getAffairs,
  getSuperCategoryCounts: vi.fn().mockResolvedValue({}),
  getCertaintyCounts: vi.fn().mockResolvedValue({}),
  getPartiesWithAffairs: mocks.getPartiesWithAffairs,
  getPublicPartyMetadataBySlug: mocks.getPublicPartyMetadataBySlug,
}));
vi.mock("@/lib/data/partis", () => ({
  getParties: mocks.getParties,
  getPartiesStats: vi.fn().mockResolvedValue({}),
}));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));

import ElectionsPage from "../elections/page";
import AffairesPage from "../affaires/page";
import PartisPage from "../partis/page";

type Params = Record<string, string>;
const render = (page: unknown, searchParams: Params) =>
  (page as (p: { searchParams: Promise<Params> }) => Promise<unknown>)({
    searchParams: Promise.resolve(searchParams),
  });

/** Reproduces `Invalid value for argument \`type\`. Expected ElectionType.` */
function assertElectionType(value: unknown) {
  if (value === undefined) return;
  if (!(Object.values(ElectionType) as unknown[]).includes(value)) {
    throw new Error("PrismaClientValidationError: Expected ElectionType.");
  }
}

/** Reproduces `Argument \`skip\` is missing.`: Prisma drops a NaN argument. */
function assertUsableSkip(page: unknown) {
  const skip = ((page as number) - 1) * AFFAIRS_PAGE_SIZE;
  if (!Number.isSafeInteger(skip) || skip < 0) {
    throw new Error("PrismaClientValidationError: Argument `skip` is missing.");
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getElections.mockImplementation(async (type?: unknown) => {
    assertElectionType(type);
    return [];
  });
  mocks.getTypeCounts.mockResolvedValue([]);
  mocks.getAffairs.mockImplementation(async (...args: unknown[]) => {
    assertUsableSkip(args[5]);
    return { affairs: [], total: 0, totalPages: 0 };
  });
  mocks.getPartiesWithAffairs.mockResolvedValue([]);
  mocks.getPublicPartyMetadataBySlug.mockResolvedValue(null);
  mocks.getParties.mockImplementation(async (_search?: unknown, position?: unknown) => {
    if (
      position !== undefined &&
      !(Object.values(PoliticalPosition) as unknown[]).includes(position)
    ) {
      throw new Error("PrismaClientValidationError: Expected PoliticalPosition.");
    }
    return [];
  });
});

describe("/elections : un ?type= hors enum", () => {
  it("rend la page au lieu de faire lever Prisma", async () => {
    await expect(render(ElectionsPage, { type: SQLI_PROBE })).resolves.toBeDefined();
  });

  it("ignore le filtre plutôt que de le transmettre", async () => {
    await render(ElectionsPage, { type: SQLI_PROBE });
    expect(mocks.getElections).toHaveBeenCalledWith(undefined);
  });

  it("conserve un type valide", async () => {
    await render(ElectionsPage, { type: "MUNICIPALES" });
    expect(mocks.getElections).toHaveBeenCalledWith("MUNICIPALES");
  });

  it("ne filtre pas quand le paramètre est absent", async () => {
    await render(ElectionsPage, {});
    expect(mocks.getElections).toHaveBeenCalledWith(undefined);
  });
});

describe("/affaires : un ?page= inexploitable", () => {
  it.each(["abc", "", "0", "-3", SQLI_PROBE])("rend la page pour page=%j", async (page) => {
    await expect(render(AffairesPage, { page })).resolves.toBeDefined();
  });

  it("retombe sur la première page", async () => {
    await render(AffairesPage, { page: "abc" });
    expect(mocks.getAffairs.mock.calls[0]?.[5]).toBe(1);
  });

  it("conserve une page valide", async () => {
    await render(AffairesPage, { page: "3" });
    expect(mocks.getAffairs.mock.calls[0]?.[5]).toBe(3);
  });
});

describe("/partis : un ?position= hors enum", () => {
  it("rend la page au lieu de faire lever Prisma", async () => {
    await expect(render(PartisPage, { position: SQLI_PROBE })).resolves.toBeDefined();
  });

  it("ignore le filtre plutôt que de le transmettre", async () => {
    await render(PartisPage, { position: SQLI_PROBE });
    expect(mocks.getParties.mock.calls[0]?.[1]).toBeUndefined();
  });

  it("conserve une position valide", async () => {
    await render(PartisPage, { position: "CENTER_LEFT" });
    expect(mocks.getParties.mock.calls[0]?.[1]).toBe("CENTER_LEFT");
  });
});
