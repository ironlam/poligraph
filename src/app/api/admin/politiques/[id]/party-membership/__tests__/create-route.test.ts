import { describe, it, expect, vi, beforeEach } from "vitest";

// Creating a history row is the only write in the admin that can rewrite another row
// (a succession closes the previous affiliation), so the refusals matter more than usual.

const h = vi.hoisted(() => ({
  politicianFindUnique: vi.fn(),
  membershipFindMany: vi.fn(),
  membershipCreate: vi.fn(),
  auditCreate: vi.fn(),
  setCurrentParty: vi.fn(),
  findCurrentOpenMembership: vi.fn(),
  invalidateEntity: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    politician: { findUnique: h.politicianFindUnique },
    partyMembership: { findMany: h.membershipFindMany, create: h.membershipCreate },
    auditLog: { create: h.auditCreate },
  },
}));
vi.mock("@/services/politician", () => ({
  setCurrentParty: h.setCurrentParty,
  findCurrentOpenMembership: h.findCurrentOpenMembership,
}));
vi.mock("@/lib/cache", () => ({ invalidateEntity: h.invalidateEntity }));
vi.mock("@/lib/api/with-admin-auth", () => ({
  withAdminAuth: (fn: (req: unknown, ctx: unknown) => unknown) => (req: unknown, ctx: unknown) =>
    fn(req, ctx),
}));
vi.mock("@/lib/security", () => ({
  withValidation:
    (_s: unknown, fn: (req: unknown, ctx: unknown, body: unknown) => unknown) =>
    async (req: { json: () => Promise<unknown> }, ctx: unknown) =>
      fn(req, ctx, await req.json()),
  getRequestMeta: () => ({ ip: "203.0.113.1", userAgent: "test-agent" }),
}));

import { POST } from "@/app/api/admin/politiques/[id]/party-membership/route";

function call(body: unknown) {
  return POST(
    { json: async () => body } as never,
    { params: Promise.resolve({ id: "pol_1" }) } as never
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  h.politicianFindUnique.mockResolvedValue({
    id: "pol_1",
    slug: "jeanne-exemple",
    currentPartyId: "p_tdp",
  });
  h.membershipFindMany.mockResolvedValue([]);
  h.membershipCreate.mockResolvedValue({ id: "m_new" });
  h.findCurrentOpenMembership.mockResolvedValue({
    id: "m_tdp",
    partyId: "p_tdp",
    startDate: new Date("2020-01-01"),
  });
  h.setCurrentParty.mockResolvedValue({ membershipId: "m_new", closedMembershipId: "m_tdp" });
});

describe("POST party-membership: creation", () => {
  it("creates a closed affiliation without touching the current party", async () => {
    const response = await call({
      mode: "closed",
      partyId: "p_ps",
      startDate: "1997-06-03",
      endDate: "2018-01-01",
      role: "MEMBRE",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, warnings: [] });
    expect(h.setCurrentParty).not.toHaveBeenCalled();
    expect(h.membershipCreate).toHaveBeenCalledWith({
      data: {
        politicianId: "pol_1",
        partyId: "p_ps",
        startDate: new Date("1997-06-03"),
        endDate: new Date("2018-01-01"),
        role: "MEMBRE",
      },
    });
    expect(h.invalidateEntity).toHaveBeenCalledWith("politician", "jeanne-exemple");
  });

  it("delegates a succession to setCurrentParty, role included", async () => {
    const response = await call({
      mode: "succeeds",
      partyId: "p_ps",
      startDate: "2026-01-01",
      role: "FONDATEUR",
    });

    expect(response.status).toBe(200);
    expect(h.setCurrentParty).toHaveBeenCalledWith("pol_1", "p_ps", {
      startDate: new Date("2026-01-01"),
      role: "FONDATEUR",
    });
    expect(h.membershipCreate).not.toHaveBeenCalled();
  });

  it("creates a parallel affiliation without touching the current party", async () => {
    const response = await call({ mode: "parallel", partyId: "p_ps", startDate: "2022-01-01" });

    expect(response.status).toBe(200);
    expect(h.setCurrentParty).not.toHaveBeenCalled();
    expect(h.membershipCreate).toHaveBeenCalledWith({
      data: {
        politicianId: "pol_1",
        partyId: "p_ps",
        startDate: new Date("2022-01-01"),
        endDate: null,
      },
    });
  });

  it("returns 404 for an unknown politician", async () => {
    h.politicianFindUnique.mockResolvedValue(null);

    const response = await call({ mode: "parallel", partyId: "p_ps" });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Politicien non trouvé" });
  });
});

describe("POST party-membership: refusals", () => {
  it("refuses a start date on or after the end date", async () => {
    const response = await call({
      mode: "closed",
      partyId: "p_ps",
      startDate: "2018-01-01",
      endDate: "2018-01-01",
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "La date de début doit être antérieure à la date de fin",
    });
    expect(h.membershipCreate).not.toHaveBeenCalled();
  });

  it("refuses closed mode without an end date", async () => {
    const response = await call({ mode: "closed", partyId: "p_ps", startDate: "1997-06-03" });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Une affiliation close exige une date de fin",
    });
    expect(h.membershipCreate).not.toHaveBeenCalled();
  });

  it("refuses an end date in an open mode", async () => {
    const response = await call({
      mode: "parallel",
      partyId: "p_ps",
      startDate: "2022-01-01",
      endDate: "2024-01-01",
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Une affiliation en cours ne peut pas porter de date de fin",
    });
    expect(h.membershipCreate).not.toHaveBeenCalled();
  });

  it("refuses a succession without a start date", async () => {
    const response = await call({ mode: "succeeds", partyId: "p_ps" });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Une succession exige une date de début",
    });
    expect(h.setCurrentParty).not.toHaveBeenCalled();
    expect(h.membershipCreate).not.toHaveBeenCalled();
  });

  it("refuses succeeding to the party that is already current", async () => {
    const response = await call({ mode: "succeeds", partyId: "p_tdp", startDate: "2026-01-01" });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Ce parti est déjà l'affiliation actuelle",
    });
    expect(h.setCurrentParty).not.toHaveBeenCalled();
    expect(h.membershipCreate).not.toHaveBeenCalled();
  });

  it("refuses a succession starting before the affiliation it would close", async () => {
    const response = await call({ mode: "succeeds", partyId: "p_ps", startDate: "1999-01-01" });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "La succession ne peut pas commencer avant l'affiliation qu'elle remplace",
    });
    expect(h.setCurrentParty).not.toHaveBeenCalled();
    expect(h.membershipCreate).not.toHaveBeenCalled();
  });

  it("refuses parallel mode when there is no current party", async () => {
    h.politicianFindUnique.mockResolvedValue({
      id: "pol_1",
      slug: "jeanne-exemple",
      currentPartyId: null,
    });

    const response = await call({ mode: "parallel", partyId: "p_ps", startDate: "2022-01-01" });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Une affiliation en parallèle exige un parti actuel. Utilisez la succession.",
    });
    expect(h.membershipCreate).not.toHaveBeenCalled();
  });
});

describe("POST party-membership: warnings and audit", () => {
  it("reports an overlap without blocking the creation", async () => {
    h.membershipFindMany.mockResolvedValue([
      {
        id: "m_ps",
        partyId: "p_ps",
        startDate: new Date("1997-06-03"),
        endDate: new Date("2018-01-01"),
        party: { shortName: "PS" },
      },
    ]);

    const response = await call({
      mode: "closed",
      partyId: "p_lr",
      startDate: "2010-01-01",
      endDate: "2015-01-01",
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.warnings).toHaveLength(1);
    expect(payload.warnings[0]).toMatchObject({ type: "OVERLAP", partyShortName: "PS" });
    expect(h.membershipCreate).toHaveBeenCalled();
  });

  // The affiliation being closed still looks open before the write. Without projecting the
  // post-write state, every single party change would raise a warning.
  it("reports no overlap for a clean succession", async () => {
    h.membershipFindMany.mockResolvedValue([
      {
        id: "m_tdp",
        partyId: "p_tdp",
        startDate: new Date("2020-01-01"),
        endDate: null,
        party: { shortName: "TDP" },
      },
    ]);

    const response = await call({ mode: "succeeds", partyId: "p_ps", startDate: "2026-01-01" });

    expect(await response.json()).toEqual({ success: true, warnings: [] });
  });

  // setCurrentParty promotes an already-open affiliation for the target party instead of
  // creating a new row, so that row IS the candidate after the write, not a coexisting
  // one. Without dropping it from the projection, every promotion would collide with itself.
  it("reports no overlap for a succession onto a party with an already-open affiliation", async () => {
    h.membershipFindMany.mockResolvedValue([
      {
        id: "m_tdp",
        partyId: "p_tdp",
        startDate: new Date("2020-01-01"),
        endDate: null,
        party: { shortName: "TDP" },
      },
      {
        id: "m_ps",
        partyId: "p_ps",
        startDate: new Date("2022-01-01"),
        endDate: null,
        party: { shortName: "PS" },
      },
    ]);

    const response = await call({ mode: "succeeds", partyId: "p_ps", startDate: "2026-01-01" });

    expect(await response.json()).toEqual({ success: true, warnings: [] });
  });

  it("records the closed membership in the audit entry", async () => {
    await call({ mode: "succeeds", partyId: "p_ps", startDate: "2026-01-01" });

    expect(h.auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "CREATE",
          entityType: "PartyMembership",
          entityId: "m_new",
          changes: expect.objectContaining({
            mode: "succeeds",
            partyId: "p_ps",
            closedMembershipId: "m_tdp",
            previousCurrentPartyId: "p_tdp",
            currentPartyChanged: true,
          }),
        }),
      })
    );
  });
});
