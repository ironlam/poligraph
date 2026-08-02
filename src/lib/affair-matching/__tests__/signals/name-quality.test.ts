import { describe, it, expect } from "vitest";
import { NameQualitySignal } from "../../signals/name-quality";
import {
  NAME_FULL_EXACT_LLR,
  NAME_LEGAL_TITLE_SURNAME_LLR,
  NAME_SURNAME_PROXIMITY_LLR,
  NAME_SURNAME_ONLY_LLR,
  NAME_SURNAME_AMBIGUOUS_LLR,
  ROLE_LOCATION_MATCH_LLR,
} from "../../signals/constants";
import type {
  AffairScoringInput,
  AffairCandidateRecord,
  AffairSignalContext,
} from "../../signals/types";
import { SourceType } from "@/generated/prisma";
import { EMPTY_SURNAME_VOCABULARY, type SurnameAmbiguity } from "../../surname-ambiguity";

const signal = new NameQualitySignal();
const context: AffairSignalContext = {
  resolverVersion: "v1",
  vocabulary: EMPTY_SURNAME_VOCABULARY,
};

function makeCandidate(overrides: Partial<AffairCandidateRecord> = {}): AffairCandidateRecord {
  return {
    id: "pol-1",
    firstName: "Jean",
    lastName: "Dupont",
    fullName: "Jean Dupont",
    normalizedLastName: "dupont",
    birthDate: null,
    deathDate: null,
    civility: null,
    departments: [],
    mandates: [],
    parties: [],
    externalIds: {},
    ...overrides,
  };
}

function makeInput(text: string): AffairScoringInput {
  return { text, metadata: { source: SourceType.PRESSE } };
}

describe("NameQualitySignal", () => {
  it("disqualifies candidates whose surname is not present in the text", () => {
    const result = signal.evaluate(
      makeInput("Le maire de Lyon a été mis en examen."),
      makeCandidate(),
      context
    );
    expect(result.disqualified).toBeDefined();
    expect(result.disqualified?.reason).toContain("surname not present");
  });

  it("returns NAME_FULL_EXACT_LLR when the full name appears verbatim", () => {
    const result = signal.evaluate(
      makeInput("Le député Jean Dupont a été interrogé hier."),
      makeCandidate(),
      context
    );
    expect(result.logLikelihoodRatio).toBe(NAME_FULL_EXACT_LLR);
    expect(result.evidence).toMatchObject({ matchType: "FULL_EXACT" });
  });

  it("returns NAME_LEGAL_TITLE_SURNAME_LLR on 'M. Dupont'", () => {
    const result = signal.evaluate(
      makeInput("M. Dupont a comparu devant le tribunal."),
      makeCandidate(),
      context
    );
    expect(result.logLikelihoodRatio).toBe(NAME_LEGAL_TITLE_SURNAME_LLR);
    expect(result.evidence).toMatchObject({ matchType: "LEGAL_TITLE_SURNAME" });
  });

  it("returns NAME_SURNAME_PROXIMITY_LLR when first and last name appear within 80 chars", () => {
    const text = "Selon le rapport, Jean, qui préside le conseil, et Dupont ont été cités.";
    const result = signal.evaluate(makeInput(text), makeCandidate(), context);
    expect(result.logLikelihoodRatio).toBe(NAME_SURNAME_PROXIMITY_LLR);
    expect(result.evidence).toMatchObject({ matchType: "PROXIMITY" });
  });

  it("returns NAME_SURNAME_ONLY_LLR when only the surname appears and is not a common word", () => {
    const result = signal.evaluate(
      makeInput("Dupont aurait reçu des fonds non déclarés."),
      makeCandidate(),
      context
    );
    expect(result.logLikelihoodRatio).toBe(NAME_SURNAME_ONLY_LLR);
    expect(result.evidence).toMatchObject({ matchType: "SURNAME_ONLY" });
  });

  it("handles accented surnames correctly", () => {
    const candidate = makeCandidate({
      firstName: "Hélène",
      lastName: "Dupré",
      fullName: "Hélène Dupré",
      normalizedLastName: "dupre",
    });
    const result = signal.evaluate(
      makeInput("Mme Dupré a été mise en examen."),
      candidate,
      context
    );
    expect(result.logLikelihoodRatio).toBe(NAME_LEGAL_TITLE_SURNAME_LLR);
  });

  it("apparie un patronyme composé quel que soit le séparateur des deux côtés", () => {
    // Le préfiltre proposait « Mayer Rossignol » sur un texte écrivant
    // « Mayer-Rossignol », et ce signal le disqualifiait comme absent du texte.
    // Rien ne plantait : le candidat disparaissait du classement.
    const candidate = makeCandidate({
      firstName: "Nicolas",
      lastName: "Mayer Rossignol",
      fullName: "Nicolas Mayer Rossignol",
      normalizedLastName: "mayer rossignol",
    });
    const result = signal.evaluate(
      makeInput("Le maire de Rouen, Nicolas Mayer-Rossignol, a déposé plainte."),
      candidate,
      context
    );
    expect(result.disqualified).toBeUndefined();
    expect(result.logLikelihoodRatio).toBe(NAME_FULL_EXACT_LLR);
  });

  it("apparie malgré une espace insécable, que la typographie française sème partout", () => {
    // Le texte stocké s'écrit « Marine Le\u00A0Pen\u00A0: 6 questions ». Le préfiltre
    // tokenise avec \\s et proposait la candidate ; ce signal comparait « le pen »
    // à « le\u00A0pen » et la disqualifiait comme absente du texte.
    const candidate = makeCandidate({
      firstName: "Marine",
      lastName: "Le Pen",
      fullName: "Marine Le Pen",
      normalizedLastName: "le pen",
    });
    const result = signal.evaluate(
      makeInput("Marine Le\u00A0Pen\u00A0: 6 questions sur un pourvoi en cassation."),
      candidate,
      context
    );
    expect(result.disqualified).toBeUndefined();
    expect(result.logLikelihoodRatio).toBe(NAME_FULL_EXACT_LLR);
  });

  it("disqualifies when the surname is too short", () => {
    const candidate = makeCandidate({
      lastName: "Do",
      fullName: "Jean Do",
      normalizedLastName: "do",
    });
    const result = signal.evaluate(makeInput("Le sujet Jean Do est évoqué."), candidate, context);
    expect(result.disqualified).toBeDefined();
  });
});

describe("NameQualitySignal — patronyme ambigu", () => {
  /** Stub rather than a built vocabulary: this suite tests the signal, not the rules. */
  const ambiguous = (kinds: Record<string, SurnameAmbiguity["kind"]>): AffairSignalContext => ({
    resolverVersion: "v1",
    vocabulary: {
      lookup: (s) => (kinds[s] ? { kind: kinds[s]!, detail: "raison mesurée" } : null),
    },
  });

  it("pénalise un appariement sur patronyme seul quand le token est ambigu", () => {
    const candidate = makeCandidate({
      firstName: "Sophie",
      lastName: "Mariné",
      fullName: "Sophie Mariné",
      normalizedLastName: "marine",
    });
    const result = signal.evaluate(
      makeInput("Marine Le Pen a été condamnée par le tribunal."),
      candidate,
      ambiguous({ marine: "GIVEN_NAME" })
    );
    expect(result.logLikelihoodRatio).toBe(NAME_SURNAME_AMBIGUOUS_LLR);
    expect(result.logLikelihoodRatio).toBeLessThan(0);
    expect(result.evidence).toMatchObject({
      matchType: "SURNAME_ONLY_AMBIGUOUS",
      ambiguity: "GIVEN_NAME",
    });
  });

  it("porte la raison dans l'explication, pour que la revue puisse la lire", () => {
    const candidate = makeCandidate({
      lastName: "Justice",
      fullName: "Paul Justice",
      normalizedLastName: "justice",
    });
    const result = signal.evaluate(
      makeInput("Le Palais de Justice a été évacué."),
      candidate,
      ambiguous({ justice: "COMMON_WORD" })
    );
    expect(result.explanation).toContain("raison mesurée");
  });

  it("n'applique jamais la pénalité quand le nom complet est présent", () => {
    // La garde centrale : au-dessus du palier « patronyme seul », le prénom ou un
    // titre a déjà établi qu'il s'agit d'un nom et non d'un mot de la phrase.
    const candidate = makeCandidate({
      firstName: "Jean",
      lastName: "Paris",
      fullName: "Jean Paris",
      normalizedLastName: "paris",
    });
    const result = signal.evaluate(
      makeInput("Jean Paris, adjoint au maire, a été mis en examen."),
      candidate,
      ambiguous({ paris: "MAJOR_COMMUNE" })
    );
    expect(result.logLikelihoodRatio).toBe(NAME_FULL_EXACT_LLR);
  });

  it("n'applique pas la pénalité sur un appariement par titre de civilité", () => {
    const candidate = makeCandidate({
      firstName: "Luc",
      lastName: "Paris",
      fullName: "Luc Paris",
      normalizedLastName: "paris",
    });
    const result = signal.evaluate(
      makeInput("M. Paris a été entendu par les enquêteurs."),
      candidate,
      ambiguous({ paris: "MAJOR_COMMUNE" })
    );
    expect(result.logLikelihoodRatio).toBe(NAME_LEGAL_TITLE_SURNAME_LLR);
  });

  it("laisse le patronyme seul non ambigu à sa valeur habituelle", () => {
    const candidate = makeCandidate({
      firstName: "Jean-Luc",
      lastName: "Mélenchon",
      fullName: "Jean-Luc Mélenchon",
      normalizedLastName: "melenchon",
    });
    const result = signal.evaluate(
      makeInput("Mélenchon est visé par une plainte."),
      candidate,
      ambiguous({ paris: "MAJOR_COMMUNE" })
    );
    expect(result.logLikelihoodRatio).toBe(NAME_SURNAME_ONLY_LLR);
  });

  it("reste rattrapable par la preuve : la pénalité ne dépasse pas un signal corroborant", () => {
    // Un candidat vraiment lié à l'affaire par son rôle doit encore pouvoir
    // franchir FLOOR_SCORE. C'est ce qui distingue la pénalité d'une disqualification.
    expect(NAME_SURNAME_AMBIGUOUS_LLR + ROLE_LOCATION_MATCH_LLR).toBeGreaterThan(0);
  });
});
