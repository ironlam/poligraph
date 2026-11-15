import { describe, expect, it } from "vitest";
import { tallyEnMots } from "@/lib/votes/departement-tally";

describe("tallyEnMots", () => {
  it("écrit les positions dans un ordre fixe et laisse de côté les comptes nuls", () => {
    expect(tallyEnMots({ pour: 5, contre: 3, abstention: 0, nonVotant: 0 })).toBe(
      "5 pour, 3 contre"
    );
    expect(tallyEnMots({ pour: 0, contre: 1, abstention: 1, nonVotant: 1 })).toBe(
      "1 contre, 1 abstention, 1 non-votant"
    );
  });

  it("accorde le pluriel", () => {
    expect(tallyEnMots({ pour: 0, contre: 0, abstention: 2, nonVotant: 2 })).toBe(
      "2 abstentions, 2 non-votants"
    );
  });
});
