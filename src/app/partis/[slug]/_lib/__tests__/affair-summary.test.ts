import { describe, expect, it } from "vitest";
import type { Involvement, JurisdictionOrder } from "@/generated/prisma";
import { AffairStatus } from "@/generated/prisma";
import { getJudicialMaturity } from "@/config/judicial-maturity";
import { CONVICTION_ROWS } from "@/lib/affairs/__tests__/fixtures/conviction-rows";
import { byCertainty, countByCertainty, summarizePartyAffairs } from "../affair-summary";

function affair(
  status: string,
  involvement: Involvement = "DIRECT",
  jurisdictionOrder: JurisdictionOrder = "PENAL"
) {
  return { status, involvement, jurisdictionOrder };
}

describe("summarizePartyAffairs", () => {
  it.each(Object.values(AffairStatus))(
    "%s : les compteurs suivent les paliers de maturité judiciaire",
    (status) => {
      const maturity = getJudicialMaturity(status);
      const summary = summarizePartyAffairs([affair(status)]);

      expect(summary.condamnationsDefinitives).toBe(status === "CONDAMNATION_DEFINITIVE" ? 1 : 0);
      expect(summary.condamnationsNonDefinitives).toBe(
        maturity === "CONDAMNATION" && status !== "CONDAMNATION_DEFINITIVE" ? 1 : 0
      );
      expect(summary.enCours).toBe(maturity === "PROCEDURE_VALIDEE" ? 1 : 0);
      expect(summary.closesSansCondamnation).toBe(maturity === "CLOSE_SANS_CONDAMNATION" ? 1 : 0);
    }
  );

  it("counts a definitive conviction as a condamnation définitive", () => {
    const summary = summarizePartyAffairs([affair("CONDAMNATION_DEFINITIVE")]);

    expect(summary.condamnationsDefinitives).toBe(1);
    expect(summary.condamnationsNonDefinitives).toBe(0);
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
    expect(summary.condamnationsDefinitives).toBe(0);
  });

  it("ne compte pas un témoin (INDIRECT) parmi les condamnations", () => {
    const summary = summarizePartyAffairs([
      affair("CONDAMNATION_DEFINITIVE", "DIRECT"),
      affair("CONDAMNATION_DEFINITIVE", "INDIRECT"),
    ]);

    expect(summary.condamnationsDefinitives).toBe(1);
  });

  it("counts a mise en examen as en cours, never a preliminary inquiry", () => {
    const summary = summarizePartyAffairs([
      affair("ENQUETE_PRELIMINAIRE"),
      affair("MISE_EN_EXAMEN"),
    ]);

    expect(summary.condamnationsDefinitives).toBe(0);
    expect(summary.condamnationsNonDefinitives).toBe(0);
    expect(summary.enCours).toBe(1);
  });

  it.each(["RELAXE", "ACQUITTEMENT", "NON_LIEU", "PRESCRIPTION", "CLASSEMENT_SANS_SUITE"])(
    "counts %s as closed without conviction",
    (status) => {
      const summary = summarizePartyAffairs([affair(status)]);

      expect(summary.condamnationsDefinitives).toBe(0);
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
    expect(summary.condamnationsDefinitives).toBe(0);
    expect(summary.condamnationsNonDefinitives).toBe(0);
    expect(summary.enCours).toBe(0);
    expect(summary.closesSansCondamnation).toBe(0);
  });

  it("counts an appeal in progress as a non-definitive conviction, never a definitive one", () => {
    const summary = summarizePartyAffairs([affair("APPEL_EN_COURS")]);
    expect(summary.condamnationsNonDefinitives).toBe(1);
    expect(summary.condamnationsDefinitives).toBe(0);
  });

  it("keeps a non-penal conviction (Cour des comptes) out of direct and of every counter", () => {
    const summary = summarizePartyAffairs([
      affair("CONDAMNATION_DEFINITIVE", "DIRECT", "FINANCIER"),
    ]);

    expect(summary.direct).toEqual([]);
    expect(summary.condamnationsDefinitives).toBe(0);
    expect(summary.condamnationsNonDefinitives).toBe(0);
  });

  it("gives the four counters of the reference rows", () => {
    const summary = summarizePartyAffairs(Object.values(CONVICTION_ROWS));

    expect(summary).toMatchObject({
      condamnationsDefinitives: 3,
      condamnationsNonDefinitives: 3,
      enCours: 1,
      closesSansCondamnation: 1,
    });
  });

  it("returns zeroes for an empty list", () => {
    expect(summarizePartyAffairs([])).toEqual({
      direct: [],
      condamnationsDefinitives: 0,
      condamnationsNonDefinitives: 0,
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
