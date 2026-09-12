import { describe, expect, it, vi, beforeEach } from "vitest";
import { getPresidentielle2027Candidates } from "./presidentielle-2027";

vi.mock("@/lib/db", () => ({
  db: {
    candidacy: { findMany: vi.fn() },
  },
}));

import { db } from "@/lib/db";

describe("getPresidentielle2027Candidates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("queries Candidacy joined to Election.slug = 'presidentielle-2027' with required relations", async () => {
    (db.candidacy.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    await getPresidentielle2027Candidates();
    const arg = (db.candidacy.findMany as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(arg?.where).toEqual({ election: { slug: "presidentielle-2027" } });
    expect(arg?.include).toMatchObject({
      politician: expect.anything(),
      party: expect.anything(),
    });
  });

  it("returns rows sorted OFFICIAL first, then DECLARE, PRESSENTI, ENVISAGE, RETIRE, then by candidateName", async () => {
    (db.candidacy.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "1", status: "ENVISAGE", candidateName: "B", politician: null, party: null },
      { id: "2", status: "OFFICIAL", candidateName: "A", politician: null, party: null },
      { id: "3", status: "PRESSENTI", candidateName: "A", politician: null, party: null },
      { id: "4", status: null, candidateName: "Z", politician: null, party: null },
    ]);

    const result = await getPresidentielle2027Candidates();
    expect(result.map((r) => r.id)).toEqual(["2", "3", "1", "4"]);
  });

  it("places RETIRE after ENVISAGE and after null status", async () => {
    (db.candidacy.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "a", status: "RETIRE", candidateName: "A", politician: null, party: null },
      { id: "b", status: "ENVISAGE", candidateName: "B", politician: null, party: null },
    ]);
    const result = await getPresidentielle2027Candidates();
    expect(result.map((r) => r.id)).toEqual(["b", "a"]);
  });
});
