import { describe, it, expect } from "vitest";
import { nameMatchesWinner } from "../lib/mayor-name-match";

// Guards Phase 3's link-to-existing paths: an existing politician may only
// inherit a 2026 winner's MAIRE mandate when BOTH first and last name match.
// Real over-match cases (Rimane, Simeoni) motivated the guard.
describe("nameMatchesWinner", () => {
  it("rejects same-surname / different-firstname (Michael vs Davy Rimane)", () => {
    // Winner "Michael Rimane" must NOT link to sitting deputy "Davy Rimane".
    expect(nameMatchesWinner("Davy", "Rimane", "Michael", "Rimane", "Michael Rimane")).toBe(false);
  });

  it("matches a short surname across case (Isabelle Pi / Isabelle PI)", () => {
    // "Pi" yields no >=3-char token: fall back to full-string equality.
    expect(nameMatchesWinner("Isabelle", "Pi", "Isabelle", "PI", "Isabelle PI")).toBe(true);
  });

  it("matches a compound first name overlap (Jean Christophe / Christophe Carlier)", () => {
    expect(
      nameMatchesWinner("Jean Christophe", "Carlier", "Christophe", "Carlier", "Christophe Carlier")
    ).toBe(true);
    // Symmetric: winner carries the compound first name.
    expect(
      nameMatchesWinner(
        "Christophe",
        "Carlier",
        "Jean Christophe",
        "Carlier",
        "Jean Christophe Carlier"
      )
    ).toBe(true);
  });

  it("matches across accents and case (Éric Ciotti / Eric CIOTTI)", () => {
    expect(nameMatchesWinner("Éric", "Ciotti", "Eric", "CIOTTI", "Eric CIOTTI")).toBe(true);
  });

  it("rejects a clearly different person in the same commune", () => {
    expect(nameMatchesWinner("Marie", "Lefebvre", "Paul", "Girard", "Paul Girard")).toBe(false);
  });

  it("real over-match: Pasquale Simeoni must not link to Gilles Simeoni", () => {
    expect(nameMatchesWinner("Pasquale", "Simeoni", "Gilles", "Simeoni", "Gilles Simeoni")).toBe(
      false
    );
  });

  it("falls back to candidateName when structured winner names are missing", () => {
    // Match via the full name.
    expect(nameMatchesWinner("Isabelle", "Pi", null, null, "Isabelle Pi")).toBe(true);
    // Mismatch via the full name (surname matches, first name differs).
    expect(nameMatchesWinner("Davy", "Rimane", null, null, "Michael Rimane")).toBe(false);
    // No winner signal at all -> cannot confirm -> reject.
    expect(nameMatchesWinner("Davy", "Rimane", null, null, null)).toBe(false);
  });

  it("does not let a short surname be swallowed by a longer one (Li vs Slimani)", () => {
    expect(nameMatchesWinner("Chen", "Li", "Karim", "Slimani", "Karim Slimani")).toBe(false);
  });
});
