import { describe, it, expect } from "vitest";
import { assessProcedureEvidence } from "../procedure-guard";

/**
 * The press pipeline must not turn a political controversy into a judicial
 * affair. AffairStatus has no "no procedure" value, so when the article
 * describes no procedure at all the model still has to pick one, and it picked
 * MISE_EN_EXAMEN with a confidence of 95 on affair AF-000515.
 *
 * The guard errs towards passing: a false pass reproduces today's behaviour
 * (a draft a moderator reviews), a false block diverts a real affair.
 */
describe("assessProcedureEvidence", () => {
  it("passes on an explicit mise en examen", () => {
    const result = assessProcedureEvidence({
      text: "Jérôme Barella a été mis en examen pour détournement de fonds publics.",
    });
    expect(result.hasProcedure).toBe(true);
    expect(result.verdict).toBe("HAS_PROCEDURE");
    expect(result.matched).not.toBeNull();
  });

  it("passes on an opened investigation", () => {
    const result = assessProcedureEvidence({
      text: "Le parquet de Paris a ouvert une enquête préliminaire après ce signalement.",
    });
    expect(result.hasProcedure).toBe(true);
  });

  it("passes on a court decision", () => {
    const result = assessProcedureEvidence({
      text: "Le tribunal correctionnel l'a condamné à deux ans avec sursis.",
    });
    expect(result.hasProcedure).toBe(true);
  });

  it("passes on a favourable outcome", () => {
    const result = assessProcedureEvidence({
      text: "La cour d'appel a prononcé une relaxe et le classement sans suite a été confirmé.",
    });
    expect(result.hasProcedure).toBe(true);
  });

  it("handles accents, curly quotes and hyphens", () => {
    const result = assessProcedureEvidence({
      text: "L’affaire s’est soldée par un non-lieu.",
    });
    expect(result.hasProcedure).toBe(true);
  });

  // Regression: AF-000515. Text anonymised on purpose: the repository is
  // public and the affair was never published.
  it("blocks a political controversy with no procedure", () => {
    const result = assessProcedureEvidence({
      text:
        "Dans un documentaire, l'ancienne ministre des Sports reconnaît avoir fait " +
        "cesser les contrôles inopinés avant la compétition, ce qu'elle avait nié " +
        "devant une commission parlementaire. Les joueurs et leur fédération avaient " +
        "fustigé ces contrôles.",
    });
    expect(result.hasProcedure).toBe(false);
    expect(result.verdict).toBe("NO_PROCEDURE");
    expect(result.matched).toBeNull();
  });

  it("does not take a speech act for a conviction", () => {
    const result = assessProcedureEvidence({
      text: "La députée a condamné ces propos et a condamné le recul du gouvernement.",
    });
    expect(result.hasProcedure).toBe(false);
  });

  it("does not take a journalistic investigation for a judicial one", () => {
    const result = assessProcedureEvidence({
      text: "Selon une enquête de la rédaction, le maire aurait favorisé cette association.",
    });
    expect(result.hasProcedure).toBe(false);
  });

  it("blocks on empty text", () => {
    expect(assessProcedureEvidence({ text: "" }).hasProcedure).toBe(false);
  });
});
