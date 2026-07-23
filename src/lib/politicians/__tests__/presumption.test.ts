import { describe, it, expect } from "vitest";
import { buildPresumptionNote } from "@/lib/politicians/presumption";

describe("buildPresumptionNote", () => {
  it("returns null when nothing needs presumption", () => {
    expect(
      buildPresumptionNote({ proceduresEnCours: 0, condamnationsNonDefinitives: 0 })
    ).toBeNull();
  });

  it("procedures only, singular", () => {
    const note = buildPresumptionNote({ proceduresEnCours: 1, condamnationsNonDefinitives: 0 })!;
    expect(note).toContain("Présomption d'innocence.");
    expect(note).toContain("1 procédure en cours");
    expect(note).not.toContain("condamnation non");
    expect(note).toContain("Cette situation ne constitue pas une condamnation définitive");
  });

  it("non-definitive convictions only, plural", () => {
    const note = buildPresumptionNote({ proceduresEnCours: 0, condamnationsNonDefinitives: 2 })!;
    expect(note).toContain("2 condamnations non définitives");
    expect(note).not.toContain("procédure");
    expect(note).toContain("Ces situations ne constituent pas des condamnations définitives");
  });

  it("combined never states a global absence of conviction", () => {
    const note = buildPresumptionNote({ proceduresEnCours: 3, condamnationsNonDefinitives: 1 })!;
    expect(note).toContain("3 procédures en cours");
    expect(note).toContain("1 condamnation non définitive");
    expect(note).not.toContain("aucune condamnation");
    expect(note).toContain("pour les faits concernés");
  });
});
