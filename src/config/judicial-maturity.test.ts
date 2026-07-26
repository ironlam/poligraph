import { describe, it, expect } from "vitest";
import type { AffairStatus } from "@/generated/prisma";
import {
  getJudicialMaturity,
  isJudiciallyValidated,
  MATURITY_LABELS,
  AGGREGATE_STATUSES,
} from "./judicial-maturity";

const ALL_STATUSES: AffairStatus[] = [
  "CONDAMNATION_DEFINITIVE",
  "CONDAMNATION_PREMIERE_INSTANCE",
  "APPEL_EN_COURS",
  "MISE_EN_EXAMEN",
  "INSTRUCTION",
  "RENVOI_TRIBUNAL",
  "PROCES_EN_COURS",
  "ENQUETE_PRELIMINAIRE",
  "RELAXE",
  "ACQUITTEMENT",
  "NON_LIEU",
  "PRESCRIPTION",
  "CLASSEMENT_SANS_SUITE",
];

describe("getJudicialMaturity", () => {
  it("maps Tier 1 - condamnation statuses", () => {
    expect(getJudicialMaturity("CONDAMNATION_DEFINITIVE")).toBe("CONDAMNATION");
    expect(getJudicialMaturity("CONDAMNATION_PREMIERE_INSTANCE")).toBe("CONDAMNATION");
    expect(getJudicialMaturity("APPEL_EN_COURS")).toBe("CONDAMNATION");
  });

  it("maps Tier 2 - procedure validee statuses", () => {
    expect(getJudicialMaturity("MISE_EN_EXAMEN")).toBe("PROCEDURE_VALIDEE");
    expect(getJudicialMaturity("INSTRUCTION")).toBe("PROCEDURE_VALIDEE");
    expect(getJudicialMaturity("RENVOI_TRIBUNAL")).toBe("PROCEDURE_VALIDEE");
    expect(getJudicialMaturity("PROCES_EN_COURS")).toBe("PROCEDURE_VALIDEE");
  });

  it("maps Tier 3 - enquete statuses", () => {
    expect(getJudicialMaturity("ENQUETE_PRELIMINAIRE")).toBe("ENQUETE");
  });

  it("maps Tier 4 - close sans condamnation statuses", () => {
    expect(getJudicialMaturity("RELAXE")).toBe("CLOSE_SANS_CONDAMNATION");
    expect(getJudicialMaturity("ACQUITTEMENT")).toBe("CLOSE_SANS_CONDAMNATION");
    expect(getJudicialMaturity("NON_LIEU")).toBe("CLOSE_SANS_CONDAMNATION");
    expect(getJudicialMaturity("PRESCRIPTION")).toBe("CLOSE_SANS_CONDAMNATION");
    expect(getJudicialMaturity("CLASSEMENT_SANS_SUITE")).toBe("CLOSE_SANS_CONDAMNATION");
  });

  it("covers all 13 AffairStatus values", () => {
    for (const status of ALL_STATUSES) {
      expect(getJudicialMaturity(status)).toBeDefined();
    }
  });
});

describe("isJudiciallyValidated", () => {
  it("returns true for Tier 1 (condamnation)", () => {
    expect(isJudiciallyValidated("CONDAMNATION_DEFINITIVE")).toBe(true);
    expect(isJudiciallyValidated("CONDAMNATION_PREMIERE_INSTANCE")).toBe(true);
    expect(isJudiciallyValidated("APPEL_EN_COURS")).toBe(true);
  });

  it("returns true for Tier 2 (procedure validee)", () => {
    expect(isJudiciallyValidated("MISE_EN_EXAMEN")).toBe(true);
    expect(isJudiciallyValidated("INSTRUCTION")).toBe(true);
    expect(isJudiciallyValidated("RENVOI_TRIBUNAL")).toBe(true);
    expect(isJudiciallyValidated("PROCES_EN_COURS")).toBe(true);
  });

  it("returns false for Tier 3 (enquete)", () => {
    expect(isJudiciallyValidated("ENQUETE_PRELIMINAIRE")).toBe(false);
  });

  it("returns false for Tier 4 (close)", () => {
    expect(isJudiciallyValidated("RELAXE")).toBe(false);
    expect(isJudiciallyValidated("ACQUITTEMENT")).toBe(false);
    expect(isJudiciallyValidated("NON_LIEU")).toBe(false);
    expect(isJudiciallyValidated("PRESCRIPTION")).toBe(false);
    expect(isJudiciallyValidated("CLASSEMENT_SANS_SUITE")).toBe(false);
  });
});

describe("AGGREGATE_STATUSES", () => {
  it("contains exactly Tier 1 + Tier 2 statuses", () => {
    const expected: AffairStatus[] = [
      "CONDAMNATION_DEFINITIVE",
      "CONDAMNATION_PREMIERE_INSTANCE",
      "APPEL_EN_COURS",
      "POURVOI_EN_CASSATION",
      "MISE_EN_EXAMEN",
      "INSTRUCTION",
      "RENVOI_TRIBUNAL",
      "PROCES_EN_COURS",
    ];
    expect(AGGREGATE_STATUSES).toHaveLength(8);
    for (const s of expected) {
      expect(AGGREGATE_STATUSES).toContain(s);
    }
  });

  it("excludes ENQUETE_PRELIMINAIRE", () => {
    expect(AGGREGATE_STATUSES).not.toContain("ENQUETE_PRELIMINAIRE");
  });

  it("excludes all Tier 4 statuses", () => {
    const tier4: AffairStatus[] = [
      "RELAXE",
      "ACQUITTEMENT",
      "NON_LIEU",
      "PRESCRIPTION",
      "CLASSEMENT_SANS_SUITE",
    ];
    for (const s of tier4) {
      expect(AGGREGATE_STATUSES).not.toContain(s);
    }
  });
});

describe("MATURITY_LABELS", () => {
  it("has French labels for all 4 tiers", () => {
    expect(MATURITY_LABELS.CONDAMNATION).toBeDefined();
    expect(MATURITY_LABELS.PROCEDURE_VALIDEE).toBeDefined();
    expect(MATURITY_LABELS.ENQUETE).toBeDefined();
    expect(MATURITY_LABELS.CLOSE_SANS_CONDAMNATION).toBeDefined();
  });
});
