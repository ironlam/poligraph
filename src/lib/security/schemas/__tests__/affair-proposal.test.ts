import { describe, it, expect } from "vitest";
import { affairPatchSchema, PROPOSABLE_FIELDS } from "@/lib/security/schemas/affair-proposal";

/**
 * The firm part of a term is a number about a named person's sentence, so the schema is
 * the first place that has to refuse an unrepresentable pair (#576).
 *
 * It cannot be the only place: a patch may carry the firm part without the total, and
 * only `acceptProposal` sees both. See proposal-review.test.ts.
 */
describe("affairPatchSchema — répartition ferme / sursis (#576)", () => {
  it("ne connaît plus prisonSuspended", () => {
    expect(affairPatchSchema.safeParse({ prisonSuspended: true }).success).toBe(false);
    expect(PROPOSABLE_FIELDS).not.toContain("prisonSuspended");
  });

  it("accepte les deux champs de part ferme", () => {
    expect(PROPOSABLE_FIELDS).toContain("prisonFirmMonths");
    expect(PROPOSABLE_FIELDS).toContain("ineligibilityFirmMonths");
  });

  it("accepte une part ferme seule, le total étant contrôlé contre la base", () => {
    expect(affairPatchSchema.safeParse({ prisonFirmMonths: 24 }).success).toBe(true);
    expect(affairPatchSchema.safeParse({ ineligibilityFirmMonths: 30 }).success).toBe(true);
  });

  it("accepte une part ferme nulle, qui dit « intégralement avec sursis »", () => {
    expect(affairPatchSchema.safeParse({ prisonMonths: 48, prisonFirmMonths: 0 }).success).toBe(
      true
    );
  });

  it("accepte de remettre la répartition à « non établie »", () => {
    expect(affairPatchSchema.safeParse({ prisonFirmMonths: null }).success).toBe(true);
  });

  it("refuse une part ferme supérieure au total quand les deux sont dans le patch", () => {
    expect(affairPatchSchema.safeParse({ prisonMonths: 48, prisonFirmMonths: 60 }).success).toBe(
      false
    );
    expect(
      affairPatchSchema.safeParse({ ineligibilityMonths: 45, ineligibilityFirmMonths: 60 }).success
    ).toBe(false);
  });

  it("accepte 9999 en total de prison mais jamais en part ferme", () => {
    // 9999 is the perpetuity sentinel. It has to pass as a total and never as a firm
    // part, since French law does not suspend a life term.
    expect(affairPatchSchema.safeParse({ prisonMonths: 9999 }).success).toBe(true);
    expect(affairPatchSchema.safeParse({ prisonFirmMonths: 9999 }).success).toBe(false);
    expect(affairPatchSchema.safeParse({ prisonMonths: 9999, prisonFirmMonths: 12 }).success).toBe(
      false
    );
  });

  it("garde le plafond de 1200 mois ailleurs", () => {
    // Guards against unit confusion (years passed as months).
    expect(affairPatchSchema.safeParse({ prisonMonths: 1201 }).success).toBe(false);
    expect(affairPatchSchema.safeParse({ prisonFirmMonths: 1201 }).success).toBe(false);
    expect(affairPatchSchema.safeParse({ ineligibilityMonths: 9999 }).success).toBe(false);
  });

  it("refuse une part ferme négative", () => {
    expect(affairPatchSchema.safeParse({ prisonFirmMonths: -1 }).success).toBe(false);
  });
});
