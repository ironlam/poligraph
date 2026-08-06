import { describe, it, expect, vi, beforeEach } from "vitest";

// Party affiliations can run in parallel (a main party plus a micro-party), so "the open
// membership" is ambiguous. These tests pin down which one each function picks.

const h = vi.hoisted(() => ({
  membershipFindFirst: vi.fn(),
  membershipUpdate: vi.fn(),
  membershipCreate: vi.fn(),
  membershipUpdateMany: vi.fn(),
  politicianFindUnique: vi.fn(),
  politicianFindMany: vi.fn(),
  politicianUpdate: vi.fn(),
}));

function txClient() {
  return {
    politician: { findUnique: h.politicianFindUnique, update: h.politicianUpdate },
    partyMembership: {
      findFirst: h.membershipFindFirst,
      update: h.membershipUpdate,
      create: h.membershipCreate,
      updateMany: h.membershipUpdateMany,
    },
  };
}

vi.mock("@/lib/db", () => ({
  db: {
    politician: {
      findUnique: h.politicianFindUnique,
      findMany: h.politicianFindMany,
      update: h.politicianUpdate,
    },
    partyMembership: {
      findFirst: h.membershipFindFirst,
      update: h.membershipUpdate,
      create: h.membershipCreate,
      updateMany: h.membershipUpdateMany,
    },
    $transaction: (fn: (t: unknown) => unknown) => fn(txClient()),
  },
}));

import { findCurrentOpenMembership, OPEN_MEMBERSHIP_ORDER_BY } from "@/services/politician";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("findCurrentOpenMembership", () => {
  it("prefers the open membership matching currentPartyId", async () => {
    h.membershipFindFirst.mockResolvedValueOnce({
      id: "m_main",
      partyId: "p_main",
      startDate: new Date("2015-01-01"),
    });

    const result = await findCurrentOpenMembership("pol_1", "p_main");

    expect(result?.id).toBe("m_main");
    expect(h.membershipFindFirst).toHaveBeenCalledTimes(1);
    expect(h.membershipFindFirst.mock.calls[0]?.[0].where).toEqual({
      politicianId: "pol_1",
      partyId: "p_main",
      endDate: null,
    });
  });

  it("falls back to the most recent open membership when currentPartyId is null", async () => {
    h.membershipFindFirst.mockResolvedValueOnce({
      id: "m_micro",
      partyId: "p_micro",
      startDate: new Date("2022-01-01"),
    });

    const result = await findCurrentOpenMembership("pol_1", null);

    expect(result?.id).toBe("m_micro");
    expect(h.membershipFindFirst.mock.calls[0]?.[0].where).toEqual({
      politicianId: "pol_1",
      endDate: null,
    });
  });

  it("falls back when currentPartyId points at a closed affiliation", async () => {
    h.membershipFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "m_micro", partyId: "p_micro", startDate: null });

    const result = await findCurrentOpenMembership("pol_1", "p_gone");

    expect(result?.id).toBe("m_micro");
    expect(h.membershipFindFirst).toHaveBeenCalledTimes(2);
  });

  it("returns null when the politician has no open membership", async () => {
    h.membershipFindFirst.mockResolvedValue(null);

    expect(await findCurrentOpenMembership("pol_1", null)).toBeNull();
  });

  // Postgres sorts NULLS FIRST on a descending order, so an unknown startDate would
  // otherwise win over a known one. Guards against a "simplification" back to
  // { startDate: "desc" }.
  it("orders unknown start dates last", async () => {
    h.membershipFindFirst.mockResolvedValue(null);

    await findCurrentOpenMembership("pol_1", null);

    expect(h.membershipFindFirst.mock.calls[0]?.[0].orderBy).toEqual([
      { startDate: { sort: "desc", nulls: "last" } },
      { createdAt: "desc" },
    ]);
    expect(OPEN_MEMBERSHIP_ORDER_BY).toEqual([
      { startDate: { sort: "desc", nulls: "last" } },
      { createdAt: "desc" },
    ]);
  });
});
