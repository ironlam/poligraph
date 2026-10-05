import { describe, it, expect } from "vitest";
import {
  getCertaintyLevel,
  CERTAINTY_LABELS,
  CERTAINTY_COLORS,
  CERTAINTY_SORT_ORDER,
  CERTAINTY_DESCRIPTIONS,
  CERTAINTY_SCORE,
  isActiveCertainty,
  isAccusedInvolvement,
  ACTIVE_AFFAIR_STATUSES,
} from "@/config/certainty";

describe("getCertaintyLevel", () => {
  it("maps CONDAMNATION_DEFINITIVE to ETABLI", () => {
    expect(getCertaintyLevel("CONDAMNATION_DEFINITIVE")).toBe("ETABLI");
  });

  it("maps CONDAMNATION_PREMIERE_INSTANCE to PRONONCE", () => {
    expect(getCertaintyLevel("CONDAMNATION_PREMIERE_INSTANCE")).toBe("PRONONCE");
  });

  it("maps APPEL_EN_COURS to PRONONCE", () => {
    expect(getCertaintyLevel("APPEL_EN_COURS")).toBe("PRONONCE");
  });

  it("maps ENQUETE_PRELIMINAIRE to EN_COURS", () => {
    expect(getCertaintyLevel("ENQUETE_PRELIMINAIRE")).toBe("EN_COURS");
  });

  it("maps INSTRUCTION to EN_COURS", () => {
    expect(getCertaintyLevel("INSTRUCTION")).toBe("EN_COURS");
  });

  it("maps MISE_EN_EXAMEN to EN_COURS", () => {
    expect(getCertaintyLevel("MISE_EN_EXAMEN")).toBe("EN_COURS");
  });

  it("maps RENVOI_TRIBUNAL to EN_COURS", () => {
    expect(getCertaintyLevel("RENVOI_TRIBUNAL")).toBe("EN_COURS");
  });

  it("maps PROCES_EN_COURS to EN_COURS", () => {
    expect(getCertaintyLevel("PROCES_EN_COURS")).toBe("EN_COURS");
  });

  it("maps RELAXE to CLOS_FAVORABLE", () => {
    expect(getCertaintyLevel("RELAXE")).toBe("CLOS_FAVORABLE");
  });

  it("maps ACQUITTEMENT to CLOS_FAVORABLE", () => {
    expect(getCertaintyLevel("ACQUITTEMENT")).toBe("CLOS_FAVORABLE");
  });

  it("maps NON_LIEU to CLOS_FAVORABLE", () => {
    expect(getCertaintyLevel("NON_LIEU")).toBe("CLOS_FAVORABLE");
  });

  it("maps PRESCRIPTION to CLOS_FAVORABLE", () => {
    expect(getCertaintyLevel("PRESCRIPTION")).toBe("CLOS_FAVORABLE");
  });

  it("maps CLASSEMENT_SANS_SUITE to CLOS_FAVORABLE", () => {
    expect(getCertaintyLevel("CLASSEMENT_SANS_SUITE")).toBe("CLOS_FAVORABLE");
  });
});

describe("isActiveCertainty", () => {
  it("returns true for ETABLI", () => {
    expect(isActiveCertainty("ETABLI")).toBe(true);
  });

  it("returns true for PRONONCE", () => {
    expect(isActiveCertainty("PRONONCE")).toBe(true);
  });

  it("returns true for EN_COURS", () => {
    expect(isActiveCertainty("EN_COURS")).toBe(true);
  });

  it("returns false for CLOS_FAVORABLE", () => {
    expect(isActiveCertainty("CLOS_FAVORABLE")).toBe(false);
  });
});

describe("isAccusedInvolvement (issue #383)", () => {
  // The certainty/status of an affair describes the outcome for the person
  // prosecuted. Only DIRECT makes the tracked politician that person, so
  // only it may carry a charging certainty badge ("Condamnation définitive").
  it("returns true for DIRECT", () => {
    expect(isAccusedInvolvement("DIRECT")).toBe(true);
  });

  it("returns false for INDIRECT (witness, secondary role)", () => {
    expect(isAccusedInvolvement("INDIRECT")).toBe(false);
  });

  it("returns false for PLAINTIFF (the politician filed the complaint)", () => {
    expect(isAccusedInvolvement("PLAINTIFF")).toBe(false);
  });

  it("returns false for VICTIM", () => {
    expect(isAccusedInvolvement("VICTIM")).toBe(false);
  });

  it("returns false for MENTIONED_ONLY", () => {
    expect(isAccusedInvolvement("MENTIONED_ONLY")).toBe(false);
  });
});

describe("CERTAINTY_SORT_ORDER", () => {
  it("orders ETABLI before PRONONCE before EN_COURS before CLOS_FAVORABLE", () => {
    expect(CERTAINTY_SORT_ORDER.ETABLI).toBeLessThan(CERTAINTY_SORT_ORDER.PRONONCE);
    expect(CERTAINTY_SORT_ORDER.PRONONCE).toBeLessThan(CERTAINTY_SORT_ORDER.EN_COURS);
    expect(CERTAINTY_SORT_ORDER.EN_COURS).toBeLessThan(CERTAINTY_SORT_ORDER.CLOS_FAVORABLE);
  });
});

describe("ACTIVE_AFFAIR_STATUSES", () => {
  it("contains all non-clos-favorable statuses", () => {
    expect(ACTIVE_AFFAIR_STATUSES).toContain("CONDAMNATION_DEFINITIVE");
    expect(ACTIVE_AFFAIR_STATUSES).toContain("CONDAMNATION_PREMIERE_INSTANCE");
    expect(ACTIVE_AFFAIR_STATUSES).toContain("APPEL_EN_COURS");
    expect(ACTIVE_AFFAIR_STATUSES).toContain("ENQUETE_PRELIMINAIRE");
    expect(ACTIVE_AFFAIR_STATUSES).toContain("INSTRUCTION");
    expect(ACTIVE_AFFAIR_STATUSES).toContain("MISE_EN_EXAMEN");
    expect(ACTIVE_AFFAIR_STATUSES).toContain("RENVOI_TRIBUNAL");
    expect(ACTIVE_AFFAIR_STATUSES).toContain("PROCES_EN_COURS");
  });

  it("does NOT contain exonerating statuses", () => {
    expect(ACTIVE_AFFAIR_STATUSES).not.toContain("RELAXE");
    expect(ACTIVE_AFFAIR_STATUSES).not.toContain("ACQUITTEMENT");
    expect(ACTIVE_AFFAIR_STATUSES).not.toContain("NON_LIEU");
    expect(ACTIVE_AFFAIR_STATUSES).not.toContain("PRESCRIPTION");
    expect(ACTIVE_AFFAIR_STATUSES).not.toContain("CLASSEMENT_SANS_SUITE");
  });
});

describe("exports are complete", () => {
  it("has labels for all 5 levels", () => {
    expect(Object.keys(CERTAINTY_LABELS)).toHaveLength(5);
  });

  it("has colors for all 5 levels", () => {
    expect(Object.keys(CERTAINTY_COLORS)).toHaveLength(5);
  });

  it("has descriptions for all 5 levels", () => {
    expect(Object.keys(CERTAINTY_DESCRIPTIONS)).toHaveLength(5);
  });
});

describe("niveau CLOS_SANS_CHARGE", () => {
  it("n'est pas une procédure active", () => {
    expect(isActiveCertainty("CLOS_SANS_CHARGE")).toBe(false);
  });

  it("pèse moins qu'une procédure en cours et plus qu'une issue favorable", () => {
    expect(CERTAINTY_SCORE.CLOS_SANS_CHARGE).toBeLessThan(CERTAINTY_SCORE.EN_COURS);
    expect(CERTAINTY_SCORE.CLOS_SANS_CHARGE).toBeGreaterThan(CERTAINTY_SCORE.CLOS_FAVORABLE);
  });

  it("se trie entre les deux", () => {
    expect(CERTAINTY_SORT_ORDER.CLOS_SANS_CHARGE).toBeGreaterThan(CERTAINTY_SORT_ORDER.EN_COURS);
    expect(CERTAINTY_SORT_ORDER.CLOS_SANS_CHARGE).toBeLessThan(CERTAINTY_SORT_ORDER.CLOS_FAVORABLE);
  });
});
