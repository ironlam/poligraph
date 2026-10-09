import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  findMany: vi.fn(),
  mandateFindMany: vi.fn().mockResolvedValue([]),
  updateMany: vi.fn(),
  requestProfileRefresh: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    politician: { findMany: h.findMany, updateMany: h.updateMany },
    mandate: { findMany: h.mandateFindMany },
  },
}));
vi.mock("@/lib/politicians/profile-snapshot/request", () => ({
  requestProfileRefresh: h.requestProfileRefresh,
}));

import { assignPublicationStatus } from "../publication-status";

function politician(id: string, publicationStatus: string, hasCurrentMandate: boolean) {
  return {
    id,
    birthDate: new Date("1970-01-01"),
    deathDate: null,
    photoUrl: null,
    biography: null,
    publicationStatus,
    statusOverride: false,
    prominenceScore: 0,
    mandates: hasCurrentMandate ? [{ id: `m-${id}` }] : [],
    affairs: [],
    candidacies: [],
  };
}

describe("assignPublicationStatus et les fiches précalculées", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.updateMany.mockResolvedValue({ count: 1 });
    h.requestProfileRefresh.mockResolvedValue({ sent: 0, mode: "targeted" });
  });

  it("demande une fois, après les écritures, le recalcul des fiches publiées et dépubliées", async () => {
    h.findMany.mockResolvedValue([
      politician("p-depublie", "PUBLISHED", false),
      politician("p-publie", "ARCHIVED", true),
      politician("p-inchange", "PUBLISHED", true),
    ]);

    await assignPublicationStatus();

    expect(h.requestProfileRefresh).toHaveBeenCalledTimes(1);
    const [target, reason] = h.requestProfileRefresh.mock.calls[0]!;
    expect(reason).toBe("sync:publication-status");
    expect([...target.politicianIds].sort()).toEqual(["p-depublie", "p-publie"]);
    expect(h.requestProfileRefresh.mock.invocationCallOrder[0]).toBeGreaterThan(
      Math.max(...h.updateMany.mock.invocationCallOrder)
    );
  });

  it("ne demande rien quand aucun statut ne change", async () => {
    h.findMany.mockResolvedValue([politician("p-inchange", "PUBLISHED", true)]);

    await assignPublicationStatus();

    expect(h.updateMany).not.toHaveBeenCalled();
    expect(h.requestProfileRefresh).not.toHaveBeenCalled();
  });

  it("ne demande rien en simulation", async () => {
    h.findMany.mockResolvedValue([politician("p-depublie", "PUBLISHED", false)]);

    await assignPublicationStatus({ dryRun: true });

    expect(h.requestProfileRefresh).not.toHaveBeenCalled();
  });

  it("expose les bascules décidées, y compris hors publication", async () => {
    h.findMany.mockResolvedValue([
      politician("p-archive", "DRAFT", false),
      politician("p-publie", "ARCHIVED", true),
    ]);

    const stats = await assignPublicationStatus({
      dryRun: true,
      politicianIds: ["p-archive", "p-publie"],
    });

    expect(stats.transitions).toEqual([
      { id: "p-archive", from: "DRAFT", to: "ARCHIVED" },
      { id: "p-publie", from: "ARCHIVED", to: "PUBLISHED" },
    ]);
    expect(h.findMany.mock.calls[0]?.[0].where).toEqual({ id: { in: ["p-archive", "p-publie"] } });
  });
});
