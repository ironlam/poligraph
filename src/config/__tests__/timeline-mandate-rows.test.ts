import { describe, expect, it } from "vitest";
import { getMandateRow, MANDATE_TYPE_COLORS } from "@/config/timeline";

// The career timeline puts each mandate on the row of its category. A type missing from
// MANDATE_CATEGORY_ORDER lands on the "other" row, below the party leaderships.
describe("ligne d'un mandat sur la frise de carrière", () => {
  it("met la présidence d'intercommunalité sur la ligne des mandats locaux", () => {
    expect(getMandateRow("PRESIDENT_INTERCOMMUNALITE")).toBe(getMandateRow("MAIRE"));
  });

  it("garde un type hors catégorie sur une autre ligne", () => {
    // Guards the assertion above: it must be able to fail.
    expect(getMandateRow("OTHER")).not.toBe(getMandateRow("MAIRE"));
  });

  it("lui donne une couleur", () => {
    expect(MANDATE_TYPE_COLORS.PRESIDENT_INTERCOMMUNALITE).toMatch(/^#[0-9a-f]{6}$/);
  });
});
