import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/data/scrutins", () => ({ getExplainedShowcase: vi.fn().mockResolvedValue([]) }));

import { ExplainedVotesModule } from "@/components/parlement/ExplainedVotesModule";

describe("ExplainedVotesModule", () => {
  it("renders nothing when the pool is empty", async () => {
    const ui = await ExplainedVotesModule({});
    expect(ui).toBeNull();
  });
});
