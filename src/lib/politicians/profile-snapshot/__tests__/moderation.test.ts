import { beforeEach, describe, expect, it, vi } from "vitest";

const { affairFindMany, mentionFindMany, refreshPoliticianProfile, inngestSend } = vi.hoisted(
  () => ({
    affairFindMany: vi.fn(),
    mentionFindMany: vi.fn(),
    refreshPoliticianProfile: vi.fn(),
    inngestSend: vi.fn(),
  })
);
vi.mock("@/lib/db", () => ({
  db: {
    affair: { findMany: affairFindMany },
    politician: { findMany: vi.fn() },
    factCheckMention: { findMany: mentionFindMany },
  },
}));
vi.mock("../refresh", () => ({ refreshPoliticianProfile }));
vi.mock("@/inngest/client", () => ({ inngest: { send: inngestSend } }));

import { MODERATION_SYNC_LIMIT, refreshProfilesForModeration } from "../moderation";
import { PROFILE_REFRESH_EVENT } from "../request";

const outcome = (politicianId: string) => ({
  politicianId,
  status: "updated" as const,
  durationMs: 1,
  reason: "r",
});

describe("refreshProfilesForModeration", () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    refreshPoliticianProfile.mockImplementation(async (id: string) => outcome(id));
    inngestSend.mockRejectedValue(new Error("no event key"));
  });

  it("recalcule dans la requête le propriétaire et les affaires liées, sans lever quand Inngest échoue", async () => {
    affairFindMany.mockResolvedValue([
      {
        id: "a1",
        politicianId: "p1",
        linkedAffair: { politicianId: "p2" },
        linkedBy: [{ politicianId: "p3" }],
      },
    ]);

    const outcomes = await refreshProfilesForModeration({ affairIds: ["a1"] }, "dépublication");

    expect(refreshPoliticianProfile.mock.calls.map((c) => c[0])).toEqual(["p1", "p2", "p3"]);
    expect(refreshPoliticianProfile).toHaveBeenCalledWith("p1", "dépublication");
    expect(outcomes.map((o) => o.politicianId)).toEqual(["p1", "p2", "p3"]);
    expect(inngestSend).not.toHaveBeenCalled();
  });

  it("recalcule un par un, jamais en parallèle", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    refreshPoliticianProfile.mockImplementation(async (id: string) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight--;
      return outcome(id);
    });

    await refreshProfilesForModeration({ politicianIds: ["p1", "p2", "p3"] }, "r");

    expect(maxInFlight).toBe(1);
  });

  it("continue après l'échec d'un recalcul, journalise et redemande le recalcul en tâche de fond", async () => {
    refreshPoliticianProfile.mockImplementation(async (id: string) => {
      if (id === "p1") throw new Error("revalidate failed");
      return outcome(id);
    });

    const outcomes = await refreshProfilesForModeration({ politicianIds: ["p1", "p2"] }, "r");

    expect(outcomes.map((o) => o.politicianId)).toEqual(["p2"]);
    const errorLine = consoleError.mock.calls[0]![0] as string;
    expect(JSON.parse(errorLine)).toEqual({
      event: "[profile-snapshot] moderation refresh failed",
      politicianId: "p1",
      reason: "r",
      error: "revalidate failed",
    });
    expect(inngestSend).toHaveBeenCalledWith([
      { name: PROFILE_REFRESH_EVENT, data: { politicianId: "p1", reason: "r" } },
    ]);
  });

  it("ne lève pas quand la résolution des cibles échoue", async () => {
    mentionFindMany.mockRejectedValue(new Error("db down"));

    await expect(refreshProfilesForModeration({ factCheckId: "f1" }, "r")).resolves.toEqual([]);

    expect(refreshPoliticianProfile).not.toHaveBeenCalled();
    expect(JSON.parse(consoleError.mock.calls[0]![0] as string)).toMatchObject({
      event: "[profile-snapshot] moderation resolve failed",
      reason: "r",
      error: "db down",
    });
  });

  it("au-delà du seuil, ne recalcule dans la requête que les fiches dont une affaire est dépubliée", async () => {
    inngestSend.mockResolvedValue(undefined);
    const many = Array.from({ length: MODERATION_SYNC_LIMIT + 1 }, (_, i) => ({
      id: `a${i}`,
      politicianId: `p${i}`,
      linkedAffair: null,
      linkedBy: [],
    }));
    affairFindMany.mockImplementation(async ({ where }: { where: { id: { in: string[] } } }) =>
      many.filter((a) => where.id.in.includes(a.id))
    );

    await refreshProfilesForModeration({ affairIds: many.map((a) => a.id) }, "lot", {
      privacyCriticalPoliticianIds: ["p0", "p1"],
    });

    expect(refreshPoliticianProfile.mock.calls.map((c) => c[0])).toEqual(["p0", "p1"]);
    const sentIds = inngestSend.mock.calls.flatMap((c) =>
      (c[0] as Array<{ data: { politicianId: string } }>).map((e) => e.data.politicianId)
    );
    expect(sentIds).toHaveLength(MODERATION_SYNC_LIMIT - 1);
    expect(sentIds).not.toContain("p0");
    expect(sentIds).not.toContain("p1");
  });

  it("au seuil exact, recalcule tout dans la requête", async () => {
    const politicianIds = Array.from({ length: MODERATION_SYNC_LIMIT }, (_, i) => `p${i}`);

    await refreshProfilesForModeration({ politicianIds }, "lot", {
      privacyCriticalPoliticianIds: [],
    });

    expect(refreshPoliticianProfile).toHaveBeenCalledTimes(MODERATION_SYNC_LIMIT);
    expect(inngestSend).not.toHaveBeenCalled();
  });
});
