import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { affairFindMany, politicianFindMany, mentionFindMany } = vi.hoisted(() => ({
  affairFindMany: vi.fn(),
  politicianFindMany: vi.fn(),
  mentionFindMany: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  db: {
    affair: { findMany: affairFindMany },
    politician: { findMany: politicianFindMany },
    factCheckMention: { findMany: mentionFindMany },
  },
}));

import {
  PROFILE_INVALIDATION_CAP,
  PROFILE_RECONCILE_EVENT,
  PROFILE_REFRESH_EVENT,
  requestProfileRefresh,
  resolveProfileTargets,
} from "../request";

const ids = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}` }));

describe("resolveProfileTargets", () => {
  beforeEach(() => vi.clearAllMocks());

  it("propage une affaire à son propriétaire et aux propriétaires des affaires liées", async () => {
    affairFindMany.mockResolvedValue([
      {
        id: "a1",
        politicianId: "p1",
        linkedAffair: { politicianId: "p2" },
        linkedBy: [{ politicianId: "p3" }, { politicianId: "p1" }],
      },
    ]);
    expect((await resolveProfileTargets({ affairIds: ["a1"] })).sort()).toEqual(["p1", "p2", "p3"]);
  });

  it("propage un parti à tous ses membres, actuels et passés", async () => {
    politicianFindMany.mockResolvedValue([{ id: "p1" }, { id: "p2" }, { id: "p1" }]);
    expect((await resolveProfileTargets({ partyId: "x" })).sort()).toEqual(["p1", "p2"]);
    expect(politicianFindMany).toHaveBeenCalledWith({
      where: { OR: [{ currentPartyId: "x" }, { partyHistory: { some: { partyId: "x" } } }] },
      select: { id: true },
    });
  });

  it("propage un fact-check aux politiciens mentionnés", async () => {
    mentionFindMany.mockResolvedValue([{ politicianId: "p1" }, { politicianId: "p2" }]);
    expect(await resolveProfileTargets({ factCheckId: "f1" })).toEqual(["p1", "p2"]);
  });

  it("dédoublonne les identifiants explicites", async () => {
    expect(await resolveProfileTargets({ politicianIds: ["p1", "p1", "p2"] })).toEqual([
      "p1",
      "p2",
    ]);
  });
});

describe("requestProfileRefresh", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("bascule sur un seul rattrapage au-delà du plafond", async () => {
    politicianFindMany.mockResolvedValue(ids(PROFILE_INVALIDATION_CAP + 1));
    const send = vi.fn().mockResolvedValue(undefined);
    expect(await requestProfileRefresh({ partyId: "x" }, "parti renommé", send)).toEqual({
      sent: 1,
      mode: "reconcile",
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith([
      { name: PROFILE_RECONCILE_EVENT, data: { reason: "parti renommé" } },
    ]);
  });

  it("reste ciblé au plafond exact", async () => {
    politicianFindMany.mockResolvedValue(ids(PROFILE_INVALIDATION_CAP));
    const send = vi.fn().mockResolvedValue(undefined);
    const res = await requestProfileRefresh({ partyId: "x" }, "r", send);
    expect(res).toEqual({ sent: PROFILE_INVALIDATION_CAP, mode: "targeted" });
  });

  it("envoie par paquets de 100", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const politicianIds = ids(250).map((r) => r.id);
    const res = await requestProfileRefresh({ politicianIds }, "import", send);
    expect(res).toEqual({ sent: 250, mode: "targeted" });
    expect(send.mock.calls.map((c: unknown[][]) => c[0]!.length)).toEqual([100, 100, 50]);
    expect(send.mock.calls[0]![0][0]).toEqual({
      name: PROFILE_REFRESH_EVENT,
      data: { politicianId: "p0", reason: "import" },
    });
  });

  it("ne lève pas quand l'envoi échoue et journalise", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const send = vi.fn().mockRejectedValue(new Error("no event key"));
    await expect(requestProfileRefresh({ politicianIds: ["p1"] }, "r", send)).resolves.toEqual({
      sent: 0,
      mode: "targeted",
    });
    expect(JSON.parse(warn.mock.calls[0]![0] as string)).toEqual({
      event: "[profile-snapshot] request failed",
      reason: "r",
      count: 1,
      error: "no event key",
    });
  });

  it("n'envoie rien sans cible", async () => {
    const send = vi.fn();
    expect(await requestProfileRefresh({ politicianIds: [] }, "r", send)).toEqual({
      sent: 0,
      mode: "targeted",
    });
    expect(send).not.toHaveBeenCalled();
  });
});
