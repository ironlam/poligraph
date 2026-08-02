import { describe, it, expect } from "vitest";
import {
  CandidatePrefilter,
  extractSurnameCandidates,
  normalizeText,
} from "../candidate-prefilter";
import type { AffairCandidateRecord } from "../signals/types";

function politician(lastName: string, id = lastName): AffairCandidateRecord {
  return {
    id,
    firstName: "Test",
    lastName,
    fullName: `Test ${lastName}`,
    normalizedLastName: normalizeText(lastName),
    birthDate: null,
    deathDate: null,
    civility: null,
    departments: [],
    mandates: [],
    parties: [],
    externalIds: {},
  };
}

describe("extractSurnameCandidates", () => {
  it("extracts capitalized sequences of at least 4 characters", () => {
    const tokens = extractSurnameCandidates("Le député Dupont et son collègue Martin ont parlé.");
    expect(tokens).toContain("dupont");
    expect(tokens).toContain("martin");
  });

  it("skips short words", () => {
    const tokens = extractSurnameCandidates("MM. Do et Li ont été interrogés.");
    expect(tokens).not.toContain("do");
    expect(tokens).not.toContain("li");
  });

  it("handles accented capitals", () => {
    const tokens = extractSurnameCandidates("Mme Éléonore Dupré a comparu.");
    expect(tokens).toContain("dupre");
    expect(tokens).toContain("eleonore");
  });
});

describe("CandidatePrefilter", () => {
  it("returns politicians whose normalized lastName appears as a surname token in the text", () => {
    const pool = [
      politician("Dupont", "p1"),
      politician("Martin", "p2"),
      politician("Le Bouillonnec", "p3"),
    ];
    const prefilter = new CandidatePrefilter(pool);
    const result = prefilter.filter("Le député Jean Dupont a été mis en examen.");
    expect(result.map((p) => p.id)).toContain("p1");
    expect(result.map((p) => p.id)).not.toContain("p2");
  });

  it("handles compound surnames by matching the primary surname", () => {
    const pool = [politician("Le Bouillonnec", "p3")];
    const prefilter = new CandidatePrefilter(pool);
    const result = prefilter.filter("Jean-Yves Le Bouillonnec a dit...");
    expect(result.map((p) => p.id)).toContain("p3");
  });

  it("returns an empty array when no surnames match", () => {
    const pool = [politician("Dupont", "p1")];
    const prefilter = new CandidatePrefilter(pool);
    const result = prefilter.filter("Aucun nom politique connu ici.");
    expect(result).toEqual([]);
  });

  it("atteint un patronyme composé dont aucun mot ne passe le plancher de 4 caractères", () => {
    // La régression qui a bloqué le tri assisté. « Le » fait deux caractères,
    // « Pen » en fait trois, et la clé d'index est « le pen » : aucun token seul
    // ne peut la produire. La condamnation la plus couverte du corpus proposait
    // donc Benoît Mariné, sur le prénom « Marine », et jamais Marine Le Pen.
    const pool = [politician("Le Pen", "lepen"), politician("Mariné", "marine")];
    const prefilter = new CandidatePrefilter(pool);
    const result = prefilter.filter(
      "Condamnée par la cour d'appel de Paris, Marine Le Pen a annoncé se pourvoir en cassation."
    );
    expect(result.map((p) => p.id)).toContain("lepen");
  });

  it("atteint un patronyme malgré le possessif anglais", () => {
    // Le corpus contient de la couverture anglophone de la politique française :
    // « Marine Le Pen's appeal » produisait la clé « le pen's ».
    const pool = [politician("Le Pen", "lepen")];
    const prefilter = new CandidatePrefilter(pool);
    const result = prefilter.filter(
      "A ruling in Marine Le Pen's appeal could settle the question."
    );
    expect(result.map((p) => p.id)).toContain("lepen");
  });

  it("n'invente pas de candidat quand les mots capitalisés ne forment aucun patronyme connu", () => {
    const pool = [politician("Le Pen", "lepen")];
    const prefilter = new CandidatePrefilter(pool);
    const result = prefilter.filter("Le Tribunal Administratif a rendu sa décision.");
    expect(result).toEqual([]);
  });
});
