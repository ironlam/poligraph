import { describe, it, expect } from "vitest";
import { isIdentityConfident } from "../identity-confidence";
import { SAME_THRESHOLD, MIN_GAP } from "../signals/constants";

const cible = "p1";

describe("isIdentityConfident", () => {
  it("accepte un nom complet exact, que le combineur refuse faute de corroboration", () => {
    // Mesuré : « François Asselineau renvoyé en procès » score 5,7 avec un
    // écart de 8,9, et ressort NO_MATCH car un titre de presse ne porte ni
    // juridiction, ni date des faits, ni parti, ni fonction.
    expect(isIdentityConfident({ topCandidateId: cible, topScore: 5.7, gap: 8.9 }, cible)).toBe(
      true
    );
  });

  it("refuse quand le resolver classe quelqu'un d'autre en tête", () => {
    // Le cas Copé : verdict SAME, mais sur un autre politicien.
    expect(isIdentityConfident({ topCandidateId: "p2", topScore: 9, gap: 9 }, cible)).toBe(false);
  });

  it("refuse une égalité entre homonymes", () => {
    // « M. Aeschlimann » sans prénom : deux candidats à égalité, gap nul.
    expect(isIdentityConfident({ topCandidateId: cible, topScore: 3.4, gap: 0 }, cible)).toBe(
      false
    );
  });

  it("refuse un patronyme seul, sous le plancher", () => {
    expect(isIdentityConfident({ topCandidateId: cible, topScore: 1.5, gap: 1.5 }, cible)).toBe(
      false
    );
  });

  it("refuse un candidat absent du classement", () => {
    expect(isIdentityConfident({ topCandidateId: null, topScore: 0, gap: 0 }, cible)).toBe(false);
  });

  it("reprend les seuils du combineur au lieu d'en inventer", () => {
    // Deux barres concurrentes pour la même question finiraient par diverger.
    expect(
      isIdentityConfident({ topCandidateId: cible, topScore: SAME_THRESHOLD, gap: MIN_GAP }, cible)
    ).toBe(true);
    expect(
      isIdentityConfident(
        { topCandidateId: cible, topScore: SAME_THRESHOLD - 0.1, gap: MIN_GAP },
        cible
      )
    ).toBe(false);
    expect(
      isIdentityConfident(
        { topCandidateId: cible, topScore: SAME_THRESHOLD, gap: MIN_GAP - 0.1 },
        cible
      )
    ).toBe(false);
  });
});
