import { describe, expect, it } from "vitest";
import type { Involvement } from "@/generated/prisma";
import { byCertainty, countByCertainty, summarizePartyAffairs } from "../affair-summary";

function affair(status: string, involvement: Involvement = "DIRECT") {
  return { status, involvement };
}

describe("summarizePartyAffairs", () => {
  it("counts a definitive conviction as a condamnation", () => {
    const summary = summarizePartyAffairs([affair("CONDAMNATION_DEFINITIVE")]);

    expect(summary.condamnations).toBe(1);
    expect(summary.enCours).toBe(0);
    expect(summary.direct[0]?.certainty).toBe("ETABLI");
  });

  it("excludes a member who is not the accused", () => {
    // #383. A member who was the victim of an offence must never appear in the party's
    // conviction count. This is the whole reason the function exists.
    const summary = summarizePartyAffairs([
      affair("CONDAMNATION_DEFINITIVE", "VICTIM"),
      affair("CONDAMNATION_DEFINITIVE", "MENTIONED_ONLY"),
    ]);

    expect(summary.direct).toEqual([]);
    expect(summary.condamnations).toBe(0);
  });

  it("keeps both accused involvements", () => {
    const summary = summarizePartyAffairs([
      affair("CONDAMNATION_DEFINITIVE", "DIRECT"),
      affair("CONDAMNATION_DEFINITIVE", "INDIRECT"),
    ]);

    expect(summary.condamnations).toBe(2);
  });

  it("counts an open investigation as en cours, not as a conviction", () => {
    const summary = summarizePartyAffairs([
      affair("ENQUETE_PRELIMINAIRE"),
      affair("MISE_EN_EXAMEN"),
    ]);

    expect(summary.condamnations).toBe(0);
    expect(summary.enCours).toBe(2);
  });

  it.each(["RELAXE", "ACQUITTEMENT", "NON_LIEU", "PRESCRIPTION", "CLASSEMENT_SANS_SUITE"])(
    "counts %s as closed without conviction",
    (status) => {
      const summary = summarizePartyAffairs([affair(status)]);

      expect(summary.condamnations).toBe(0);
      expect(summary.enCours).toBe(0);
      expect(summary.closesSansCondamnation).toBe(1);
    }
  );

  it("counts a closed instruction in none of the three totals", () => {
    // Characterisation, not endorsement. INSTRUCTION_CLOSE was added as its own maturity tier
    // after this summary was written, and the three counters were never widened to include it.
    // The affair still shows in `direct`, so it appears in the certainty badges and the list,
    // but no summary line mentions it. Changing that changes a public count on every party
    // page, so it is recorded here rather than fixed in passing.
    const summary = summarizePartyAffairs([affair("INSTRUCTION_CLOTUREE_SANS_MISE_EN_EXAMEN")]);

    expect(summary.direct).toHaveLength(1);
    expect(summary.condamnations).toBe(0);
    expect(summary.enCours).toBe(0);
    expect(summary.closesSansCondamnation).toBe(0);
  });

  it("counts an appeal in progress as a conviction, because one was pronounced", () => {
    const summary = summarizePartyAffairs([affair("APPEL_EN_COURS")]);
    expect(summary.condamnations).toBe(1);
  });

  it("returns zeroes for an empty list", () => {
    expect(summarizePartyAffairs([])).toEqual({
      direct: [],
      condamnations: 0,
      enCours: 0,
      closesSansCondamnation: 0,
    });
  });

  it("keeps the caller's own fields on each affair", () => {
    const summary = summarizePartyAffairs([
      { ...affair("CONDAMNATION_DEFINITIVE"), id: "a1", title: "Emplois fictifs" },
    ]);

    expect(summary.direct[0]).toMatchObject({ id: "a1", title: "Emplois fictifs" });
  });
});

describe("byCertainty", () => {
  it("leads with what is established, not what is alleged", () => {
    const sorted = byCertainty([
      { certainty: "EN_COURS" as const, id: "c" },
      { certainty: "ETABLI" as const, id: "a" },
      { certainty: "PRONONCE" as const, id: "b" },
    ]);

    expect(sorted.map((a) => a.id)).toEqual(["a", "b", "c"]);
  });

  it("does not mutate its input", () => {
    const input = [{ certainty: "EN_COURS" as const }, { certainty: "ETABLI" as const }];
    byCertainty(input);
    expect(input[0]?.certainty).toBe("EN_COURS");
  });
});

describe("countByCertainty", () => {
  it("counts one level at a time", () => {
    const affairs = [
      { certainty: "ETABLI" as const },
      { certainty: "ETABLI" as const },
      { certainty: "EN_COURS" as const },
    ];

    expect(countByCertainty(affairs, "ETABLI")).toBe(2);
    expect(countByCertainty(affairs, "EN_COURS")).toBe(1);
    expect(countByCertainty(affairs, "CLOS_FAVORABLE")).toBe(0);
  });
});
