import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

import { getAttributedCertaintyLevel, isAccusedInvolvement } from "@/config/certainty";
import {
  DEFAULT_LISTING_INVOLVEMENTS,
  VICTIM_LISTING_INVOLVEMENTS,
  getAdverseAffairWhere,
  getAdverseInvolvementSql,
  getDocumentaryAffairWhere,
  isCountedInAdverseAggregates,
} from "../public-filters";
import { ATTRIBUTION_ROWS } from "./fixtures/attribution";
import { evaluateWhere } from "./fixtures/evaluate-where";

describe("prédicat d'attribution à charge", () => {
  it.each(ATTRIBUTION_ROWS)("$key : les trois formes du prédicat concordent", (row) => {
    expect(isCountedInAdverseAggregates(row)).toBe(row.expectedAdverse);
    expect(evaluateWhere(row, getAdverseAffairWhere())).toBe(row.expectedAdverse);

    const sql = getAdverseInvolvementSql("a");
    const text = sql.sql + sql.values.join(" ");
    expect(text).toContain("'DIRECT'");
    expect(text).not.toContain("INDIRECT");
  });

  it("l'évaluateur refuse un opérateur qu'il ne connaît pas", () => {
    expect(() => evaluateWhere(ATTRIBUTION_ROWS[0]!, { status: { contains: "x" } })).toThrow();
  });

  it("isAccusedInvolvement est faux pour INDIRECT", () => {
    expect(isAccusedInvolvement("INDIRECT")).toBe(false);
    expect(isAccusedInvolvement("DIRECT")).toBe(true);
  });

  it("getAttributedCertaintyLevel renvoie null pour un témoin condamné et ETABLI pour une condamnation DIRECT définitive", () => {
    expect(
      getAttributedCertaintyLevel({ involvement: "INDIRECT", status: "CONDAMNATION_DEFINITIVE" })
    ).toBeNull();
    expect(
      getAttributedCertaintyLevel({ involvement: "DIRECT", status: "CONDAMNATION_DEFINITIVE" })
    ).toBe("ETABLI");
  });

  it("getDocumentaryAffairWhere garde les INDIRECT du listing", () => {
    const indirect = ATTRIBUTION_ROWS.find((r) => r.key === "indirectWitnessConvicted")!;
    expect(DEFAULT_LISTING_INVOLVEMENTS).toContain("INDIRECT");
    expect(VICTIM_LISTING_INVOLVEMENTS).toEqual(["VICTIM", "PLAINTIFF"]);
    expect(evaluateWhere(indirect, getDocumentaryAffairWhere(DEFAULT_LISTING_INVOLVEMENTS))).toBe(
      true
    );
    expect(evaluateWhere(indirect, getDocumentaryAffairWhere(VICTIM_LISTING_INVOLVEMENTS))).toBe(
      false
    );
  });
});
