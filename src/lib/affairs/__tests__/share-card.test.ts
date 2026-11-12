import { describe, expect, it } from "vitest";
import { CERTAINTY_DESCRIPTIONS } from "@/config/certainty";
import { buildAffairShareCard } from "@/lib/affairs/share-card";

const base = {
  involvement: "DIRECT",
  status: "MISE_EN_EXAMEN",
  jurisdictionOrder: "PENAL",
  category: "CORRUPTION",
  title: "Affaire d'exemple",
  sentence: null,
  fullName: "Camille Exemple",
  partyAtTime: "Parti d'exemple",
  sourceCount: 3,
} as const;

describe("buildAffairShareCard", () => {
  it.each(["INDIRECT", "MENTIONED_ONLY", "VICTIM", "PLAINTIFF"] as const)(
    "gives no card to a person who is not the one targeted (%s)",
    (involvement) => {
      expect(buildAffairShareCard({ ...base, involvement })).toBeNull();
    }
  );

  it("gives no card outside a penal procedure", () => {
    expect(buildAffairShareCard({ ...base, jurisdictionOrder: "ADMINISTRATIF" })).toBeNull();
  });

  it("gives no card without a source to count", () => {
    expect(buildAffairShareCard({ ...base, sourceCount: 0 })).toBeNull();
  });

  it("states an ongoing procedure with its step and the presumption of innocence", () => {
    const card = buildAffairShareCard(base)!;
    expect(card.certaintyLabel).toBe("Procédure en cours");
    expect(card.stepLabel).toBe("Mise en examen");
    expect(card.roleLabel).toBe("Personne mise en cause");
    expect(card.notice).toBe(CERTAINTY_DESCRIPTIONS.EN_COURS);
    expect(card.notice).toContain("présomption d'innocence");
  });

  it("keeps the presumption on a conviction that is not final, and prints the sentence", () => {
    const card = buildAffairShareCard({
      ...base,
      status: "APPEL_EN_COURS",
      sentence: " 2 ans de prison avec sursis ",
    })!;
    expect(card.certaintyLabel).toBe("Condamnation non définitive");
    expect(card.roleLabel).toContain("non définitive");
    expect(card.notice).toContain("présomption d'innocence");
    expect(card.sentence).toBe("2 ans de prison avec sursis");
  });

  it("does not repeat the level as a step when both say the same", () => {
    const card = buildAffairShareCard({ ...base, status: "CONDAMNATION_DEFINITIVE" })!;
    expect(card.certaintyLabel).toBe("Condamnation définitive");
    expect(card.stepLabel).toBeNull();
    expect(card.roleLabel).toBe("Personne condamnée");
  });

  it("gives a closed procedure its own card, with no sentence on it", () => {
    const card = buildAffairShareCard({ ...base, status: "RELAXE", sentence: "résidu" })!;
    expect(card.certaintyLabel).toBe("Procédure close sans condamnation");
    expect(card.stepLabel).toBe("Relaxe");
    expect(card.roleLabel).toBe("Personne qui était mise en cause");
    expect(card.sentence).toBeNull();
  });

  it("carries the party at the time of the facts, or none", () => {
    expect(buildAffairShareCard(base)!.partyAtTime).toBe("Parti d'exemple");
    expect(buildAffairShareCard({ ...base, partyAtTime: null })!.partyAtTime).toBeNull();
  });
});
