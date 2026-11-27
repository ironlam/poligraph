import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    affairPoliticianDecision: { findMany: vi.fn() },
    source: { findMany: vi.fn() },
    affair: { findMany: vi.fn() },
  },
}));
vi.mock("@/lib/affairs/publish-guard", () => ({ checkPublishable: vi.fn() }));

import { db } from "@/lib/db";
import { checkPublishable } from "@/lib/affairs/publish-guard";
import { loadBlockedAffairs } from "@/lib/affairs/blocked-affairs";

const AFFAIR = {
  id: "aff_1",
  slug: "affaire-test",
  title: "Affaire test",
  publicationStatus: "DRAFT" as const,
  updatedAt: new Date("2026-11-27"),
  politician: { fullName: "Personne test" },
};
const SOURCE_URL = "https://presse.example/article";
const MATCHING_REASON = {
  code: "UNREVIEWED_MATCHING_DECISION" as const,
  decisionIds: ["dec_1"],
  message: "Attribution à valider",
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(db.affairPoliticianDecision.findMany).mockResolvedValue([]);
  vi.mocked(db.source.findMany).mockResolvedValue([]);
  vi.mocked(db.affair.findMany).mockResolvedValue([AFFAIR] as never);
  vi.mocked(checkPublishable).mockResolvedValue([MATCHING_REASON]);
});

describe("loadBlockedAffairs", () => {
  it("inclut tous les verdicts liés directement et limite le repli aux orphelins SAME/UNDECIDED", async () => {
    vi.mocked(db.affairPoliticianDecision.findMany).mockResolvedValue([
      { affairId: AFFAIR.id, chosenPoliticianId: null, sourceRef: "Q945181" },
    ] as never);

    const blocked = await loadBlockedAffairs();

    // Un NO_MATCH lié sans candidat doit atteindre le garde de publication.
    expect(db.affairPoliticianDecision.findMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { affairId: { not: null } },
          {
            affairId: null,
            judgment: { in: ["SAME", "UNDECIDED"] },
            chosenPoliticianId: { not: null },
          },
        ],
      },
      select: { affairId: true, chosenPoliticianId: true, sourceRef: true },
    });
    expect(checkPublishable).toHaveBeenCalledWith(AFFAIR.id);
    expect(blocked).toEqual([expect.objectContaining({ id: AFFAIR.id, decisionIds: ["dec_1"] })]);
    expect(db.source.findMany).not.toHaveBeenCalled();
  });

  it("retrouve un orphelin par URL et personne, puis laisse le garde trancher", async () => {
    vi.mocked(db.affairPoliticianDecision.findMany).mockResolvedValue([
      { affairId: null, chosenPoliticianId: "pol_1", sourceRef: SOURCE_URL },
    ] as never);
    vi.mocked(db.source.findMany).mockResolvedValue([
      { url: SOURCE_URL, affairId: AFFAIR.id, affair: { politicianId: "pol_1" } },
      { url: SOURCE_URL, affairId: "aff_other", affair: { politicianId: "pol_other" } },
    ] as never);
    vi.mocked(checkPublishable).mockResolvedValue([]);

    expect(await loadBlockedAffairs()).toEqual([]);
    expect(db.affair.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: { in: [AFFAIR.id] },
          publicationStatus: { in: ["DRAFT", "PUBLISHED"] },
        },
      })
    );
    expect(checkPublishable).toHaveBeenCalledWith(AFFAIR.id);
  });
});
