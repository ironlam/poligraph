import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/data/scrutins", () => ({ getExplainedShowcase: vi.fn().mockResolvedValue([]) }));

import { ExplainedVotesTeaser } from "@/components/parlement/ExplainedVotesTeaser";

describe("ExplainedVotesTeaser", () => {
  it("renders nothing when the pool is empty", async () => {
    const ui = await ExplainedVotesTeaser({ excludeScrutinIds: [] });
    expect(ui).toBeNull();
  });
});
