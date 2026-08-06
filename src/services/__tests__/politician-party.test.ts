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
  syncAllCurrentParties,
  auditPartyConsistency,
  removeParty,
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

  it("applies an explicit startDate and role to the promoted row, still without a create", async () => {
    h.politicianFindUnique.mockResolvedValue({ currentPartyId: null });
    // 1st findFirst: findCurrentOpenMembership fallback (no currentPartyId) -> none open.
    // 2nd findFirst: existingOpenForParty for the target party -> the row to promote.
    h.membershipFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "m_micro", partyId: "p_ps", startDate: new Date("2022-01-01") });

    const result = await setCurrentParty("pol_1", "p_ps", {
      startDate: new Date("2026-01-01"),
      role: "FONDATEUR",
    });

    expect(h.membershipUpdate).toHaveBeenCalledWith({
      where: { id: "m_micro" },
      data: { startDate: new Date("2026-01-01"), role: "FONDATEUR" },
    });
    expect(h.membershipCreate).not.toHaveBeenCalled();
    expect(result.membershipId).toBe("m_micro");
  });

  // Protects the sync callers (deputes, senateurs, gouvernement, mep-parties), which call
  // setCurrentParty without a startDate. If the promotion overwrote it unconditionally, the
  // daily sync would rewrite a sourced start date to today's every time it promotes a
  // parallel affiliation. Note: careers.ts DOES pass a startDate, so this guard alone does
  // not protect that path; isPromotion (tested below) is what does.
  it("does not call update on the promoted row when no startDate option is supplied", async () => {
    h.politicianFindUnique.mockResolvedValue({ currentPartyId: null });
    h.membershipFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "m_micro", partyId: "p_ps", startDate: new Date("2022-01-01") });

    await setCurrentParty("pol_1", "p_ps");

    expect(h.membershipUpdate).not.toHaveBeenCalled();
  });

  // The critical case: careers.ts (and the admin route) always pass an explicit startDate,
  // so hasExplicitStartDate is always true there. When the incoming party is already
  // currentPartyId, existingOpenForParty is the very row backing it: this call must be a
  // true no-op, or a sync/re-save would silently rewrite that row's sourced start date.
  it("issues no update and no create when the incoming party is already the current one", async () => {
    h.politicianFindUnique.mockResolvedValue({ currentPartyId: "p_main" });
    // 1st findFirst: open membership for currentPartyId (found -> partyId === partyId, so
    // nothing is closed). 2nd findFirst: existingOpenForParty for the incoming party -> the
    // same row.
    h.membershipFindFirst
      .mockResolvedValueOnce({ id: "m_main", partyId: "p_main", startDate: new Date("1998-01-01") })
      .mockResolvedValueOnce({
        id: "m_main",
        partyId: "p_main",
        startDate: new Date("1998-01-01"),
      });

    const result = await setCurrentParty("pol_1", "p_main", {
      startDate: new Date("2015-01-01"),
      role: "FONDATEUR",
    });

    expect(h.membershipUpdate).not.toHaveBeenCalled();
    expect(h.membershipCreate).not.toHaveBeenCalled();
    expect(result).toEqual({ membershipId: "m_main", closedMembershipId: null });
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

describe("syncAllCurrentParties", () => {
  it("leaves a currentPartyId that matches an open affiliation alone", async () => {
    h.politicianFindMany.mockResolvedValue([
      {
        id: "pol_1",
        currentPartyId: "p_main",
        partyHistory: [
          { partyId: "p_micro", party: { shortName: "MICRO" } },
          { partyId: "p_main", party: { shortName: "MAIN" } },
        ],
      },
    ]);

    const result = await syncAllCurrentParties();

    expect(h.politicianUpdate).not.toHaveBeenCalled();
    expect(result).toEqual({ updated: 0, errors: [] });
  });

  it("repairs a currentPartyId that no longer matches any open affiliation", async () => {
    h.politicianFindMany.mockResolvedValue([
      {
        id: "pol_1",
        currentPartyId: "p_gone",
        partyHistory: [{ partyId: "p_micro", party: { shortName: "MICRO" } }],
      },
    ]);

    const result = await syncAllCurrentParties();

    expect(h.politicianUpdate).toHaveBeenCalledWith({
      where: { id: "pol_1" },
      data: { currentPartyId: "p_micro" },
    });
    expect(result.updated).toBe(1);
  });

  it("clears currentPartyId when no affiliation is open", async () => {
    h.politicianFindMany.mockResolvedValue([
      { id: "pol_1", currentPartyId: "p_gone", partyHistory: [] },
    ]);

    await syncAllCurrentParties();

    expect(h.politicianUpdate).toHaveBeenCalledWith({
      where: { id: "pol_1" },
      data: { currentPartyId: null },
    });
  });
});

describe("auditPartyConsistency", () => {
  it("does not flag a parallel affiliation as an inconsistency", async () => {
    h.politicianFindMany.mockResolvedValue([
      {
        id: "pol_1",
        fullName: "Jeanne Exemple",
        currentPartyId: "p_main",
        currentParty: { shortName: "MAIN" },
        partyHistory: [
          { partyId: "p_micro", party: { shortName: "MICRO" } },
          { partyId: "p_main", party: { shortName: "MAIN" } },
        ],
      },
    ]);

    expect(await auditPartyConsistency()).toEqual([]);
  });

  it("flags a currentPartyId that matches no open affiliation", async () => {
    h.politicianFindMany.mockResolvedValue([
      {
        id: "pol_1",
        fullName: "Jeanne Exemple",
        currentPartyId: "p_gone",
        currentParty: { shortName: "GONE" },
        partyHistory: [{ partyId: "p_micro", party: { shortName: "MICRO" } }],
      },
    ]);

    expect(await auditPartyConsistency()).toEqual([
      {
        politicianId: "pol_1",
        fullName: "Jeanne Exemple",
        currentPartyId: "p_gone",
        expectedPartyId: "p_micro",
        currentPartyName: "GONE",
        expectedPartyName: "MICRO",
      },
    ]);
  });
});

describe("removeParty", () => {
  it("closes only the affiliation of the current party", async () => {
    h.politicianFindUnique.mockResolvedValue({ currentPartyId: "p_main" });

    await removeParty("pol_1", new Date("2026-02-01"));

    expect(h.membershipUpdateMany).toHaveBeenCalledWith({
      where: { politicianId: "pol_1", partyId: "p_main", endDate: null },
      data: { endDate: new Date("2026-02-01") },
    });
    expect(h.politicianUpdate).toHaveBeenCalledWith({
      where: { id: "pol_1" },
      data: { currentPartyId: null },
    });
  });

  it("closes nothing when there is no current party", async () => {
    h.politicianFindUnique.mockResolvedValue({ currentPartyId: null });

    await removeParty("pol_1", new Date("2026-02-01"));

    expect(h.membershipUpdateMany).not.toHaveBeenCalled();
  });
});
