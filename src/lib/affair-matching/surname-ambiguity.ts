/**
 * Surname ambiguity vocabulary.
 *
 * The dominant noise in the affair-matching registry is a surname that is also
 * an ordinary word of the text. The prefilter fires on any capitalized token of
 * 4+ characters, so "Depuis 2019…", "Palais de Justice" and "Marine Le Pen" all
 * propose a politician whose surname happens to be Depuis, Justice or Mariné.
 *
 * Three layers answer "is this token a plausible surname *here*?", all computed
 * from data the project already holds. No external dictionary: the INSEE and
 * given-name files exist, but a vocabulary measured on our own corpus is better
 * calibrated to the texts we actually resolve.
 *
 * Thresholds were measured against the real SURNAME_ONLY corpus, not chosen by
 * eye. Two earlier formulations were refuted by that measurement and are
 * recorded here because both are the obvious thing to reach for:
 *
 *  - **Raw document frequency** kills "Le Pen" (18% of documents). In a registry
 *    of political affairs, df measures notoriety, not ambiguity.
 *  - **Bare commune membership** kills "Cahuzac" (a commune of 356) and
 *    "François" (999). A large share of French surnames derive from toponyms.
 *
 * What survives is the distinction between a word and a name: a common word
 * appears in lowercase in running text, a proper noun essentially never does.
 * Measured on the corpus, the separation is total — 2% lowercase for "paris",
 * 0% for "le pen", against 71% for "cour" and 96% for "juge".
 */

/**
 * Normalizes a name or token for case- and accent-insensitive comparison.
 *
 * Shared with the name-quality signal on purpose: the vocabulary is keyed by the
 * normalized surname, so the two must agree exactly or every lookup misses in
 * silence.
 */
export function normalizeForMatching(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[‘’]/g, "'").trim();
}

/** Why a surname is not usable as the sole evidence of a match. */
export type SurnameAmbiguity =
  | { kind: "MAJOR_COMMUNE"; detail: string }
  | { kind: "GIVEN_NAME"; detail: string }
  | { kind: "COMMON_WORD"; detail: string };

export interface SurnameVocabulary {
  /** Returns null when the surname carries no ambiguity signal. */
  lookup(normalizedSurname: string): SurnameAmbiguity | null;
}

/**
 * Thresholds, measured on the 1473 SURNAME_ONLY lines of the registry.
 *
 * The risk here is asymmetric. Dropping a real attribution loses an affair
 * silently; keeping noise costs the moderator a click. Every threshold is
 * therefore set on the conservative side of what the measurement allows.
 */
export const AMBIGUITY_RULES = {
  /**
   * 20 000, not 1 000. The sweep from 1 000 to 100 000 moves the result by ten
   * lines out of 1473, so the permissive end buys nothing and puts real
   * surnames at risk: Boyer (35 politicians, commune of 725), Marie (26, 109)
   * and Mathieu (28, 2331) all survive at 20 000 and would not at 1 000.
   */
  minCommunePopulation: 20_000,

  /**
   * The ratio beats membership. "Frédéric" is borne as a given name by 344
   * politicians and as a surname by one; "Thomas" is 66 against 63 and stays.
   */
  minGivenNameRatio: 0.7,
  /** Guards the ratio against tiny denominators. */
  minGivenNameBearers: 5,

  /**
   * Anywhere in 20%-50% gives the same answer to within eleven lines: the gap
   * between the two populations is that wide.
   */
  minLowercaseRate: 0.3,
  /** A token seen twice, once lowercase, is not evidence of anything. */
  minOccurrences: 20,
} as const;

export interface VocabularyInput {
  communes: ReadonlyArray<{ name: string; population: number | null }>;
  politicianNames: ReadonlyArray<{ firstName: string; lastName: string }>;
  /** Free text of the corpus the resolver works on, used for the case test. */
  corpus: readonly string[];
}

/** Strips diacritics while preserving case, which the lowercase test needs. */
function deaccent(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Single-word, letters only. The case test is a per-token statistic, so it
 * cannot speak about "de france" or "saint-etienne"; more to the point, a
 * surname carrying a lowercase particle ("de Villiers", "van Grieken") would
 * read as 100% lowercase and be condemned for its particle. Compound surnames
 * are also the more distinctive ones, so excluding them costs little.
 */
function isSingleToken(s: string): boolean {
  return /^[a-z']+$/.test(s);
}

/**
 * Builds the vocabulary from plain data. Takes no database handle so it stays
 * testable and so signals remain pure; the loader lives in persistence.ts.
 */
export function buildSurnameVocabulary(input: VocabularyInput): SurnameVocabulary {
  // Layer 1: communes, weighted by population.
  const communePopulation = new Map<string, number>();
  for (const c of input.communes) {
    const key = normalizeForMatching(c.name);
    const pop = c.population ?? 0;
    if (pop > (communePopulation.get(key) ?? 0)) communePopulation.set(key, pop);
  }

  // Layer 2: how often each token is borne as a given name versus a surname.
  const asGivenName = new Map<string, number>();
  const asSurname = new Map<string, number>();
  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
  for (const p of input.politicianNames) {
    for (const t of normalizeForMatching(p.firstName).split(/\s+/)) if (t) bump(asGivenName, t);
    for (const t of normalizeForMatching(p.lastName).split(/\s+/)) if (t) bump(asSurname, t);
  }

  // Layer 3: one pass over the corpus, counting each token's casing.
  const casing = new Map<string, { lower: number; upper: number }>();
  for (const doc of input.corpus) {
    for (const m of deaccent(doc).matchAll(/[A-Za-z][A-Za-z']*/g)) {
      const token = m[0];
      const key = token.toLowerCase();
      const entry = casing.get(key) ?? { lower: 0, upper: 0 };
      const initial = token.charAt(0);
      if (initial === initial.toLowerCase()) entry.lower++;
      else entry.upper++;
      casing.set(key, entry);
    }
  }

  return {
    lookup(normalizedSurname: string): SurnameAmbiguity | null {
      const population = communePopulation.get(normalizedSurname) ?? 0;
      if (population >= AMBIGUITY_RULES.minCommunePopulation) {
        return {
          kind: "MAJOR_COMMUNE",
          detail: `commune de ${population.toLocaleString("fr-FR")} habitants`,
        };
      }

      const given = asGivenName.get(normalizedSurname) ?? 0;
      const surname = asSurname.get(normalizedSurname) ?? 0;
      if (given >= AMBIGUITY_RULES.minGivenNameBearers && given + surname > 0) {
        const ratio = given / (given + surname);
        if (ratio >= AMBIGUITY_RULES.minGivenNameRatio) {
          return {
            kind: "GIVEN_NAME",
            detail: `prénom pour ${given} élus contre ${surname} patronymes`,
          };
        }
      }

      if (isSingleToken(normalizedSurname)) {
        const entry = casing.get(normalizedSurname);
        if (entry) {
          const total = entry.lower + entry.upper;
          const rate = total > 0 ? entry.lower / total : 0;
          if (total >= AMBIGUITY_RULES.minOccurrences && rate >= AMBIGUITY_RULES.minLowercaseRate) {
            return {
              kind: "COMMON_WORD",
              detail: `en minuscule dans ${Math.round(rate * 100)}% de ses ${total} occurrences`,
            };
          }
        }
      }

      return null;
    },
  };
}

/** A vocabulary that flags nothing. For callers that score without a corpus. */
export const EMPTY_SURNAME_VOCABULARY: SurnameVocabulary = { lookup: () => null };
