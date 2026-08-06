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

import {
  findCurrentOpenMembership,
  OPEN_MEMBERSHIP_ORDER_BY,
  setCurrentParty,
} from "@/services/politician";

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

describe("setCurrentParty", () => {
  it("closes the affiliation matching currentPartyId, not a more recent parallel one", async () => {
    h.politicianFindUnique.mockResolvedValue({ currentPartyId: "p_main" });
    // 1st findFirst: open membership for currentPartyId. 2nd: open membership for the
    // incoming party, to avoid creating a duplicate.
    h.membershipFindFirst
      .mockResolvedValueOnce({ id: "m_main", partyId: "p_main", startDate: new Date("2015-01-01") })
      .mockResolvedValueOnce(null);
    h.membershipCreate.mockResolvedValue({ id: "m_new" });

    const result = await setCurrentParty("pol_1", "p_new", {
      startDate: new Date("2026-01-01"),
    });

    expect(h.membershipFindFirst.mock.calls[0]?.[0].where).toEqual({
      politicianId: "pol_1",
      partyId: "p_main",
      endDate: null,
    });
    expect(h.membershipUpdate).toHaveBeenCalledWith({
      where: { id: "m_main" },
      data: { endDate: new Date("2026-01-01") },
    });
    expect(result).toEqual({ membershipId: "m_new", closedMembershipId: "m_main" });
  });

  it("promotes an existing open affiliation instead of duplicating it", async () => {
    h.politicianFindUnique.mockResolvedValue({ currentPartyId: "p_main" });
    h.membershipFindFirst
      .mockResolvedValueOnce({ id: "m_main", partyId: "p_main", startDate: new Date("2015-01-01") })
      .mockResolvedValueOnce({
        id: "m_micro",
        partyId: "p_micro",
        startDate: new Date("2022-01-01"),
      });

    const result = await setCurrentParty("pol_1", "p_micro", {
      startDate: new Date("2026-01-01"),
    });

    expect(h.membershipCreate).not.toHaveBeenCalled();
    expect(result.membershipId).toBe("m_micro");
    expect(h.politicianUpdate).toHaveBeenCalledWith({
      where: { id: "pol_1" },
      data: { currentPartyId: "p_micro" },
    });
  });

  it("passes the role through to the created membership", async () => {
    h.politicianFindUnique.mockResolvedValue({ currentPartyId: null });
    h.membershipFindFirst.mockResolvedValue(null);
    h.membershipCreate.mockResolvedValue({ id: "m_new" });

    await setCurrentParty("pol_1", "p_new", {
      startDate: new Date("2026-01-01"),
      role: "FONDATEUR",
    });

    expect(h.membershipCreate).toHaveBeenCalledWith({
      data: {
        politicianId: "pol_1",
        partyId: "p_new",
        startDate: new Date("2026-01-01"),
        role: "FONDATEUR",
      },
    });
  });

  it("creates nothing and closes nothing when the politician has no affiliation", async () => {
    h.politicianFindUnique.mockResolvedValue({ currentPartyId: null });
    h.membershipFindFirst.mockResolvedValue(null);

    const result = await setCurrentParty("pol_1", null, { startDate: new Date("2026-01-01") });

    expect(h.membershipCreate).not.toHaveBeenCalled();
    expect(h.membershipUpdate).not.toHaveBeenCalled();
    expect(result).toEqual({ membershipId: null, closedMembershipId: null });
  });
});
