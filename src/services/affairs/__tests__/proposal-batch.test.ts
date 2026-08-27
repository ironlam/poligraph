import { describe, expect, it, vi } from "vitest";
import { AFFAIR_EVOLUTION_REVELATION_TITLE } from "@/lib/security/schemas/affair-proposal";
import {
  collectProposalCandidatesForBatch,
  selectProposalIdsForBatch,
} from "@/services/affairs/proposal-batch";

const eventPatch = {
  addEvent: {
    date: "2026-08-27T08:00:00.000Z",
    type: "REVELATION",
    title: AFFAIR_EVOLUTION_REVELATION_TITLE,
    description: null,
    sourceUrl: "https://www.lemonde.fr/politique/article-test.html",
    sourceTitle: "Titre original",
  },
};

describe("selectProposalIdsForBatch", () => {
  it("exclut un événement sans opt-in explicite", () => {
    expect(
      selectProposalIdsForBatch(
        ["patch-1", "event-1"],
        [
          { id: "patch-1", proposedPatch: { court: "Tribunal judiciaire de Paris" } },
          { id: "event-1", proposedPatch: eventPatch },
        ],
        false
      )
    ).toEqual({ acceptedIds: ["patch-1"], excludedEventIds: ["event-1"] });
  });

  it("inclut un événement avec l’opt-in explicite", () => {
    expect(
      selectProposalIdsForBatch(["event-1"], [{ id: "event-1", proposedPatch: eventPatch }], true)
    ).toEqual({ acceptedIds: ["event-1"], excludedEventIds: [] });
  });
});

describe("collectProposalCandidatesForBatch", () => {
  it("applies the limit after excluded event proposals", async () => {
    const candidates = [
      ...Array.from({ length: 5 }, (_, index) => ({
        id: `event-${index}`,
        proposedPatch: eventPatch,
      })),
      { id: "patch-1", proposedPatch: { court: "TJ de Paris" } },
      { id: "patch-2", proposedPatch: { court: "CA de Paris" } },
    ];
    const fetchPage = vi.fn(async ({ skip, take }: { skip: number; take: number }) =>
      candidates.slice(skip, skip + take)
    );

    const result = await collectProposalCandidatesForBatch(fetchPage, 2, false, 3);

    expect(result.rows.map((row) => row.id)).toEqual(["patch-1", "patch-2"]);
    expect(result.excludedEvents).toBe(5);
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });

  it("keeps event proposals when explicitly included", async () => {
    const candidates = [
      { id: "event-1", proposedPatch: eventPatch },
      { id: "patch-1", proposedPatch: { court: "TJ de Paris" } },
    ];

    const result = await collectProposalCandidatesForBatch(
      async ({ skip, take }) => candidates.slice(skip, skip + take),
      1,
      true,
      1
    );

    expect(result.rows.map((row) => row.id)).toEqual(["event-1"]);
    expect(result.excludedEvents).toBe(0);
  });
});
