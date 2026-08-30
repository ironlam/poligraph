import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  communeFindMany: vi.fn(),
  communeFindUnique: vi.fn(),
  electionFindUnique: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    $queryRaw: mocks.queryRaw,
    commune: { findMany: mocks.communeFindMany, findUnique: mocks.communeFindUnique },
    election: { findUnique: mocks.electionFindUnique },
  },
}));

import {
  findCommuneByInsee,
  isValidDepartmentCode,
  listCommunesByDepartment,
  searchCommunesByText,
  type CommuneSearchScope,
} from "../commune-search";

const SCOPE_2026: CommuneSearchScope = { electionId: "e-2026", listCounting: "distinct-names" };
const SCOPE_2014: CommuneSearchScope = { electionId: "e-2014", listCounting: "rows" };

const MONTPELLIER = {
  id: "34172",
  name: "Montpellier",
  departmentCode: "34",
  departmentName: "34",
  population: 300_000,
  totalSeats: 65,
};

/** Flatten a Prisma.sql template back into inspectable text plus its bound values. */
function lastRawQuery(): { text: string; values: unknown[] } {
  const call = mocks.queryRaw.mock.calls.at(-1);
  const sql = call?.[0] as { strings?: readonly string[]; values?: unknown[] } | undefined;
  return {
    text: (sql?.strings ?? []).join(" ? "),
    values: sql?.values ?? [],
  };
}

/** The `where` handed to the last commune.findMany call. */
function lastWhere(): Record<string, unknown> {
  const call = mocks.communeFindMany.mock.calls.at(-1);
  return (call?.[0] as { where: Record<string, unknown> }).where;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.communeFindMany.mockResolvedValue([MONTPELLIER]);
  mocks.communeFindUnique.mockResolvedValue(MONTPELLIER);
  mocks.queryRaw.mockResolvedValue([{ communeId: "34172", listCount: 13, candidateCount: 909 }]);
});

describe("candidacy counts are scoped to one election", () => {
  // Regression: the 2026 route's SQL had lost `AND c."electionId" = ...`, so a commune that
  // also ran in 2014 and 2020 had all three years summed. Montpellier was served as 36 lists
  // instead of 13. Every entry point must bind the election.
  it.each([
    ["text search", () => searchCommunesByText("Montpel", SCOPE_2026)],
    ["insee lookup", () => findCommuneByInsee("34172", SCOPE_2026)],
    ["department listing", () => listCommunesByDepartment("34", SCOPE_2026)],
  ])("binds the election id in %s", async (_label, run) => {
    await run();

    const { text, values } = lastRawQuery();
    expect(text).toContain('c."electionId"');
    expect(values).toContain("e-2026");
  });

  it("counts distinct list names from 2020 onwards", async () => {
    await searchCommunesByText("Montpel", SCOPE_2026);
    expect(lastRawQuery().text).toContain('COUNT(DISTINCT c."listName")');
  });

  it("counts rows for 2014, which stored one candidacy per list", async () => {
    await searchCommunesByText("Montpel", SCOPE_2014);

    const { text, values } = lastRawQuery();
    expect(text).toContain("COUNT(*)");
    expect(text).not.toContain("DISTINCT");
    expect(values).toContain("e-2014");
  });

  it("skips the query entirely when nothing matched", async () => {
    mocks.communeFindMany.mockResolvedValue([]);
    await searchCommunesByText("zzzz", SCOPE_2026);
    expect(mocks.queryRaw).not.toHaveBeenCalled();
  });

  it("reports zero rather than undefined for a commune with no candidacy", async () => {
    mocks.queryRaw.mockResolvedValue([]);
    const [result] = await searchCommunesByText("Montpel", SCOPE_2026);

    expect(result).toMatchObject({ id: "34172", listCount: 0, candidateCount: 0 });
  });
});

describe("text search picks a query shape", () => {
  it("ignores a query shorter than two characters without touching the database", async () => {
    expect(await searchCommunesByText("M", SCOPE_2026)).toEqual([]);
    expect(mocks.communeFindMany).not.toHaveBeenCalled();
  });

  it("matches a full postal code exactly", async () => {
    await searchCommunesByText("34000", SCOPE_2026);
    expect(lastWhere()).toMatchObject({ postalCodes: { has: "34000" } });
  });

  it("reads two or three digits as a department code", async () => {
    await searchCommunesByText("34", SCOPE_2026);
    expect(lastWhere()).toMatchObject({ departmentCode: "34" });
  });

  it("falls back to the name search on four digits", async () => {
    // An incomplete postal code cannot use the array index, so there is nothing faster to run.
    await searchCommunesByText("3400", SCOPE_2026);
    expect(lastWhere()).toMatchObject({ name: { contains: "3400", mode: "insensitive" } });
  });

  it("searches by name on anything else", async () => {
    await searchCommunesByText("Montpel", SCOPE_2026);
    expect(lastWhere()).toMatchObject({ name: { contains: "Montpel", mode: "insensitive" } });
  });

  it("caps the autocomplete at eight rows", async () => {
    await searchCommunesByText("Saint", SCOPE_2026);
    expect(mocks.communeFindMany.mock.calls.at(-1)?.[0]).toMatchObject({ take: 8 });
  });
});

describe("text search options", () => {
  it("upper-cases a department restriction so 2a matches 2A", async () => {
    await searchCommunesByText("Ajac", SCOPE_2026, { departmentCode: "2a" });
    expect(lastWhere()).toMatchObject({ departmentCode: "2A" });
  });

  it("scopes the round-1 filter to the same election", async () => {
    // Same defect as the count: an unscoped `some: { round: 1 }` matched a commune holding
    // only 2020 results, and offered it as a 2026 result.
    await searchCommunesByText("Montpel", SCOPE_2026, { withRound1ResultsOnly: true });

    expect(lastWhere()).toMatchObject({
      communeElectionRounds: { some: { round: 1, electionId: "e-2026" } },
    });
  });

  it("leaves the round filter out when not asked for", async () => {
    await searchCommunesByText("Montpel", SCOPE_2026);
    expect(lastWhere()).not.toHaveProperty("communeElectionRounds");
  });
});

describe("lookups", () => {
  it("returns null for an unknown insee code without counting anything", async () => {
    mocks.communeFindUnique.mockResolvedValue(null);

    expect(await findCommuneByInsee("99999", SCOPE_2026)).toBeNull();
    expect(mocks.queryRaw).not.toHaveBeenCalled();
  });

  it("caps a department listing at a hundred rows", async () => {
    await listCommunesByDepartment("34", SCOPE_2026);
    expect(mocks.communeFindMany.mock.calls.at(-1)?.[0]).toMatchObject({ take: 100 });
  });
});

describe("isValidDepartmentCode", () => {
  it.each(["01", "13", "2A", "2b", "974", "1"])("accepts %s", (code) => {
    expect(isValidDepartmentCode(code)).toBe(true);
  });

  it.each(["", "abc", "1234", "3C", "34;DROP", "-1"])("rejects %s", (code) => {
    expect(isValidDepartmentCode(code)).toBe(false);
  });
});
