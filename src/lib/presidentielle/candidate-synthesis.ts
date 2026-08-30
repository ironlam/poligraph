/**
 * Builds the prompt for a candidacy synthesis, and screens what comes back.
 *
 * The synthesis is written from what this site already holds — the mandates and
 * votes on the record, and the measures we have published for this candidacy — so
 * every sentence has something the reader can check further down the same page.
 * That constraint is the whole design: a summary that reaches beyond the page it
 * sits on would be an editorial claim about a candidate, made in an election year,
 * with nothing behind it.
 *
 * Both halves are pure and exported separately from the call itself, so the prompt
 * and the screen can be tested without a network or an API key.
 */

import type { ThemeCategory } from "@/generated/prisma";
import { THEME_CATEGORY_LABELS } from "@/config/labels";

/** Longest a field may be before it goes into the prompt. */
const FIELD_LIMIT = 240;

/**
 * Word bounds. Two numbers, and the whole point is that they are two.
 *
 * A single number played both roles and could not: the prompt asked for "entre 90 et 200 mots",
 * and the screen refused anything under 90. So the length we WANT was also the length below which
 * we threw the text away. On a first run thirteen of twenty candidacies came back between 27 and
 * 75 words, all correct, all rejected. Nathalie Arthaud, who has no mandate, no recorded vote and
 * five measures, wrote 81 honest words, was told the minimum was 90, had nothing left but filler,
 * failed twice, and her fiche kept no summary at all.
 *
 * Splitting the roles dissolves it:
 *
 * - {@link synthesisTargetRange} is what the prompt asks for. It is a target, and being under it is
 *   a disappointment, not a fault. It follows the material, one term per thing there is to say, so
 *   a candidacy with a one-line career is not asked for the paragraph it cannot fill.
 * - {@link synthesisFloor} is what the screen refuses. It catches an answer that is not an answer:
 *   an empty reply, one line, a truncation. It sits far below the target on purpose, because every
 *   attempt to make it double as a quality bar has rejected honest work.
 *
 * A normally documented candidacy still targets 90 words. Only a programme large enough to make
 * that format structurally selective gets more room. Checked against the twenty declared
 * candidacies in production before that extension, every stored synthesis clears its own floor,
 * the tightest margin being 27 words against a floor of 25.
 */
export const SYNTHESIS_MAX_WORDS = 200;
/** Five programme themes plus a career paragraph fit without turning into a catalogue. */
export const LARGE_SYNTHESIS_MAX_WORDS = 250;
/** Below one hundred measures, the existing 200-word format already carries the material. */
export const LARGE_PROGRAMME_MEASURES = 100;

/** Target terms: the identity sentence, then a paragraph per section, in two steps each. */
export const TARGET_BASE = 25;
export const TARGET_THIN_CAREER = 15;
export const TARGET_CAREER = 30;
export const TARGET_FEW_MEASURES = 15;
export const TARGET_MEASURES = 35;
export const TARGET_LARGE_PROGRAMME = 125;

/**
 * Where a section stops being a sentence and becomes a paragraph.
 *
 * A career counts as substantial on mandates OR on recorded votes: François Ruffin holds three
 * mandates and a thousand votes, which is a record to describe whatever the mandate count says.
 */
export const SUBSTANTIAL_MANDATES = 4;
export const SUBSTANTIAL_VOTES = 100;
export const SUBSTANTIAL_MEASURES = 4;

/** Floor terms: one clause of identity, one sentence per section that exists. */
export const FLOOR_BASE = 15;
export const FLOOR_PER_SECTION = 10;

/**
 * What the prompt was built from, reduced to what decides the length.
 *
 * The three counts and not three booleans: both bounds distinguish a section that is a sentence
 * from one that is a paragraph, and a boolean cannot carry that.
 */
export type SynthesisMaterial = {
  mandateCount: number;
  voteCount: number;
  measureCount: number;
};

function hasCareer(material: SynthesisMaterial): boolean {
  return material.mandateCount > 0 || material.voteCount > 0;
}

/** The length the prompt asks for. Stated to the model, never enforced against it. */
export function synthesisTargetRange(material: SynthesisMaterial): { min: number; max: number } {
  const career = !hasCareer(material)
    ? 0
    : material.mandateCount >= SUBSTANTIAL_MANDATES || material.voteCount >= SUBSTANTIAL_VOTES
      ? TARGET_CAREER
      : TARGET_THIN_CAREER;
  const programme =
    material.measureCount === 0
      ? 0
      : material.measureCount >= LARGE_PROGRAMME_MEASURES
        ? TARGET_LARGE_PROGRAMME
        : material.measureCount >= SUBSTANTIAL_MEASURES
          ? TARGET_MEASURES
          : TARGET_FEW_MEASURES;
  const max =
    material.measureCount >= LARGE_PROGRAMME_MEASURES
      ? LARGE_SYNTHESIS_MAX_WORDS
      : SYNTHESIS_MAX_WORDS;
  return { min: TARGET_BASE + career + programme, max };
}

/** The length below which there is no answer to keep. Enforced; deliberately far under the target. */
export function synthesisFloor(material: SynthesisMaterial): number {
  const sections = (hasCareer(material) ? 1 : 0) + (material.measureCount > 0 ? 1 : 0);
  return FLOOR_BASE + sections * FLOOR_PER_SECTION;
}

/** The material of a built prompt, so a caller never has to restate it. */
export function synthesisMaterial(input: CandidateSynthesisInput): SynthesisMaterial {
  return {
    mandateCount: input.mandates.length,
    voteCount: input.voteCount,
    measureCount: input.measures.length,
  };
}

export type SynthesisMandate = {
  role: string;
  institution: string | null;
  startYear: number | null;
  endYear: number | null;
};

export type CandidateSynthesisInput = {
  candidateName: string;
  partyLabel: string | null;
  mandates: SynthesisMandate[];
  /** Recorded votes on this site, all legislatures. Zero for someone who never sat. */
  voteCount: number;
  measures: Array<{ theme: ThemeCategory; text: string }>;
};

type ProgrammeReference = {
  ref: string;
  theme: ThemeCategory;
  text: string;
};

type ProgrammePlan = {
  references: ProgrammeReference[];
  expectedThemes: ThemeCategory[];
};

/**
 * Neutralises a database value before it reaches the prompt.
 *
 * Angle brackets go first and they are the point: the prompt delimits its sections
 * with XML tags, so a stored measure ending in `</programme>` closes the section
 * early and everything after it reads as instructions rather than as data. Quotes
 * and newlines are the same attack with less structure. Every value here is
 * editorial content someone typed, so none of it is trusted.
 */
function safe(value: string): string {
  return (
    value
      .replace(/[<>]/g, " ")
      .replace(/["\n\r]/g, " ")
      // Long dashes are normalised on the way IN, not just refused on the way out.
      // Two party names carry one ("Les Écologistes – Europe Écologie Les Verts",
      // "Nouveau Parti anticapitaliste – Révolutionnaires"), the model copied them
      // faithfully, and the output screen rejected it for that. It was punishing
      // accuracy: the only long dash the model had ever seen was one we handed it.
      // The database keeps the official name, this only touches the prompt.
      .replace(/[—–]/g, "-")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, FIELD_LIMIT)
  );
}

/** Reader-facing measure wording, changed only where the house style already requires it. */
function canonicalMeasureText(value: string): string {
  return value.replace(/[—–]/g, "-").replace(/\s+/g, " ").trim();
}

function formatMandate(mandate: SynthesisMandate): string {
  const where = mandate.institution ? ` (${safe(mandate.institution)})` : "";
  const from = mandate.startYear ?? "?";
  const to = mandate.endYear ?? "en cours";
  return `- ${safe(mandate.role)}${where}, ${from} à ${to}`;
}

/**
 * The rules, with the length the material actually supports.
 *
 * A function and no longer a constant, and that is the half of the fix the screen alone cannot
 * make: telling every candidacy "entre 90 et 200 mots" while accepting 60 from some of them leaves
 * the model aiming at a number it has no material for. It then pads, which the rules forbid, or
 * stops short, which the screen used to punish. The prompt and the screen now read the same
 * `synthesisMinWords`.
 */
export function buildSynthesisSystemPrompt(material: SynthesisMaterial): string {
  return `Tu rédiges pour Poligraph, un site français de transparence politique. Ta tâche est une synthèse factuelle du parcours et du programme d'une candidature à l'élection présidentielle.

Règles absolues :
- N'écris RIEN qui ne figure pas dans les données fournies. Aucune connaissance extérieure, aucune inférence sur les intentions, aucune prévision.
- Ne mentionne AUCUNE affaire judiciaire, enquête, mise en examen ou condamnation, même si tu en connais. Ce n'est pas le sujet de ce texte et c'est traité ailleurs sur le site.
- Aucun jugement de valeur, aucun qualificatif d'appréciation. Ni « ambitieux », ni « radical », ni « crédible », ni « clivant ». Décris, ne commente pas.
- Aucune comparaison avec un autre candidat.
- Ne compte pas les mesures et ne dis pas combien il y en a : le chiffre est affiché à côté et il bougera.
- Appuie-toi sur la répartition et la couverture attendue fournies avec le programme. Représente chacun des thèmes demandés par au moins un engagement concret.
- Ne cite pas plus de deux engagements d'un même thème. Ne concentre jamais le paragraphe sur un thème tant que les thèmes attendus ne sont pas tous représentés.

Forme :
- Français, avec tous les accents.
- Deux paragraphes : le parcours d'abord, le programme ensuite.
- Entre ${synthesisTargetRange(material).min} et ${synthesisTargetRange(material).max} mots au total.
- Aucun tiret cadratin ni demi-cadratin. Utilise virgules, parenthèses ou deux-points.
- Pas de phrase de conclusion générale du type « une candidature qui entend peser ». Termine sur un fait.
- Si le parcours est vide, dis-le en une phrase simple plutôt que de meubler. Le programme vide suit le marqueur imposé ci-dessous et sa phrase est ajoutée par le serveur.

Format interne obligatoire :
- Place le premier paragraphe dans <parcours>...</parcours>, lui-même dans une unique balise <synthese>...</synthese>.
- Si des mesures sont fournies, ajoute ensuite <programme> avec uniquement des balises vides <engagement ref="M1" />. Choisis les références qui couvrent les thèmes attendus, sans aucun texte libre dans <programme>.
- Si aucune mesure n'est fournie, ajoute uniquement <programme-vide /> après le parcours.
- Le serveur compose lui-même le paragraphe public du programme à partir des formulations exactes référencées. N'écris et ne paraphrase aucun engagement.
- Ces balises sont retirées après contrôle et ne seront jamais montrées au lecteur.`;
}

function buildProgrammePlan(input: CandidateSynthesisInput): ProgrammePlan {
  const references = input.measures.map((measure, index) => ({
    ref: `M${index + 1}`,
    theme: measure.theme,
    text: canonicalMeasureText(measure.text),
  }));
  const counts = new Map<ThemeCategory, number>();
  for (const reference of references) {
    counts.set(reference.theme, (counts.get(reference.theme) ?? 0) + 1);
  }
  const themes = [...counts.entries()].sort(
    ([themeA, countA], [themeB, countB]) =>
      countB - countA ||
      THEME_CATEGORY_LABELS[themeA].localeCompare(THEME_CATEGORY_LABELS[themeB], "fr")
  );
  // Theme frequency is context, not an editorial ranking. It gives a stable, candidate-agnostic
  // answer to “principal themes” while the explicit cap prevents the largest family swallowing the
  // paragraph. Five examples fit the large 250-word format; three fit the standard one. A longer
  // selection reads like an extraction dump rather than a summary, especially on mobile.
  const coverageLimit = input.measures.length >= LARGE_PROGRAMME_MEASURES ? 5 : 3;
  return {
    references,
    expectedThemes: themes.slice(0, coverageLimit).map(([theme]) => theme),
  };
}

export function buildCandidateSynthesisPrompt(input: CandidateSynthesisInput): string {
  const mandates =
    input.mandates.length > 0
      ? input.mandates.map(formatMandate).join("\n")
      : "Aucun mandat enregistré sur le site.";

  const programmePlan = buildProgrammePlan(input);
  const byTheme = new Map<ThemeCategory, ProgrammeReference[]>();
  for (const reference of programmePlan.references) {
    if (!byTheme.has(reference.theme)) byTheme.set(reference.theme, []);
    byTheme.get(reference.theme)!.push(reference);
  }
  const themes = [...byTheme.entries()].sort(
    ([themeA, referencesA], [themeB, referencesB]) =>
      referencesB.length - referencesA.length ||
      THEME_CATEGORY_LABELS[themeA].localeCompare(THEME_CATEGORY_LABELS[themeB], "fr")
  );
  const expectedThemes = programmePlan.expectedThemes.map((theme) => THEME_CATEGORY_LABELS[theme]);
  const measures =
    themes.length > 0
      ? themes
          .map(
            ([theme, references]) =>
              `${THEME_CATEGORY_LABELS[theme]} (${references.length} mesure${references.length > 1 ? "s" : ""}) :\n${references
                .sort((a, b) => a.text.localeCompare(b.text, "fr"))
                .map((reference) => `  - [${reference.ref}] ${safe(reference.text)}`)
                .join("\n")}`
          )
          .join("\n")
      : "Aucune mesure publiée pour cette candidature.";
  const distribution =
    themes.length > 0
      ? themes
          .map(
            ([theme, references]) =>
              `- ${THEME_CATEGORY_LABELS[theme]} : ${references.length} mesure${references.length > 1 ? "s" : ""}`
          )
          .join("\n")
      : "Aucun thème représenté.";
  const coverage =
    expectedThemes.length > 0
      ? `Représente au moins une mesure de chacun de ces thèmes : ${expectedThemes.join(", ")}.`
      : "Aucun thème à représenter.";

  const votes =
    input.voteCount > 0
      ? `${input.voteCount} votes enregistrés sur le site.`
      : "Aucun vote enregistré sur le site.";

  return `<candidature>
<nom>${safe(input.candidateName)}</nom>
<parti>${input.partyLabel ? safe(input.partyLabel) : "non renseigné"}</parti>
</candidature>

<parcours>
${mandates}
${votes}
</parcours>

<programme>
<repartition_themes>
${distribution}
</repartition_themes>
<couverture_attendue>
${coverage}
</couverture_attendue>
<mesures_par_theme>
${measures}
</mesures_par_theme>
</programme>

Rédige la synthèse.`;
}

export type SynthesisScreen =
  | { ok: true; text: string }
  | { ok: false; reason: string; detail: string };

export const EMPTY_PROGRAMME_SENTENCE =
  "Aucune mesure n'est publiée dans le cadre de son programme.";

function formatFrenchList(values: string[]): string {
  if (values.length <= 1) return values[0] ?? "";
  if (values.length === 2) return `${values[0]} et ${values[1]}`;
  return `${values.slice(0, -1).join(", ")} et ${values.at(-1)}`;
}

function sourceTextForQuote(value: string): string {
  return value.replace(/[.]+$/u, "");
}

function formatProgrammeText(references: ProgrammeReference[]): string {
  const quotedMeasures = references.map((reference) => `« ${sourceTextForQuote(reference.text)} »`);
  const terminalPunctuation = /[!?] »$/u.test(quotedMeasures.at(-1) ?? "") ? "" : ".";
  return `Parmi les mesures publiées figurent ${formatFrenchList(quotedMeasures)}${terminalPunctuation}`;
}

function wordCount(value: string): number {
  return value.trim() === "" ? 0 : value.trim().split(/\s+/).length;
}

/**
 * Validates the internal evidence markup and returns only the reader-facing prose.
 *
 * Theme names or paraphrases reported beside the prose would be unverifiable declarations by the
 * same model that wrote it. The provider therefore returns references only. The screen resolves
 * them against the input, derives their themes, and constructs the public paragraph from the
 * canonical source wording. No generated verb can reverse or soften a published action.
 */
export function screenCandidateSynthesis(
  raw: string,
  input: CandidateSynthesisInput
): SynthesisScreen {
  const wrapper =
    /^<synthese>\s*<parcours>([\s\S]*?)<\/parcours>\s*([\s\S]*?)\s*<\/synthese>$/u.exec(raw.trim());
  if (!wrapper) {
    return {
      ok: false,
      reason: "format_structure",
      detail: "la réponse doit contenir un parcours structuré dans une unique balise <synthese>",
    };
  }

  const career = wrapper[1]!.trim();
  const programmeOutput = wrapper[2]!.trim();
  if (!/\p{L}{2,}/u.test(career) || !/[.!?]$/u.test(career)) {
    return {
      ok: false,
      reason: "parcours_vide",
      detail: "le parcours doit contenir une phrase non vide",
    };
  }
  if (/[<>]/u.test(career)) {
    return {
      ok: false,
      reason: "format_structure",
      detail: "le parcours contient une balise interne interdite",
    };
  }

  const plan = buildProgrammePlan(input);
  if (plan.references.length === 0) {
    if (!/^<programme-vide\s*\/>$/u.test(programmeOutput)) {
      return {
        ok: false,
        reason: "programme_vide_invalide",
        detail: "une candidature sans mesure doit utiliser uniquement <programme-vide />",
      };
    }
    return screenSynthesis({
      text: `${career}\n\n${EMPTY_PROGRAMME_SENTENCE}`,
      generatedText: career,
      exemptSourceTexts: [],
      material: synthesisMaterial(input),
    });
  }

  const programme = /^<programme>\s*([\s\S]*?)\s*<\/programme>$/u.exec(programmeOutput);
  if (!programme) {
    return {
      ok: false,
      reason: "format_programme",
      detail: "les références doivent être contenues dans une unique balise <programme>",
    };
  }
  const references = new Map(plan.references.map((reference) => [reference.ref, reference]));
  const themeCounts = new Map<ThemeCategory, number>();
  const usedReferences = new Set<string>();
  const selectedReferences: ProgrammeReference[] = [];
  const engagementPattern = /<engagement ref="(M[1-9][0-9]*)"\s*\/>/gu;
  let failure: Extract<SynthesisScreen, { ok: false }> | null = null;
  const remainder = programme[1]!.replace(engagementPattern, (_match, ref: string) => {
    const source = references.get(ref);
    if (!source) {
      failure = {
        ok: false,
        reason: "preuve_inconnue",
        detail: `la référence ${ref} ne correspond à aucune mesure fournie`,
      };
      return "";
    }
    if (usedReferences.has(ref)) {
      failure = {
        ok: false,
        reason: "preuve_repetee",
        detail: `la référence ${ref} est utilisée plusieurs fois`,
      };
      return "";
    }
    usedReferences.add(ref);
    selectedReferences.push(source);
    themeCounts.set(source.theme, (themeCounts.get(source.theme) ?? 0) + 1);
    return "";
  });
  if (failure) return failure;
  if (remainder.trim() !== "") {
    return {
      ok: false,
      reason: "format_structure",
      detail: "le programme doit contenir uniquement des références de mesures sans texte libre",
    };
  }

  for (const theme of plan.expectedThemes) {
    if (!themeCounts.has(theme)) {
      return {
        ok: false,
        reason: "couverture_theme",
        detail: `aucun engagement vérifiable ne représente le thème ${THEME_CATEGORY_LABELS[theme]}`,
      };
    }
  }
  for (const [theme, count] of themeCounts) {
    if (count > 2) {
      return {
        ok: false,
        reason: "concentration_theme",
        detail: `${count} engagements représentent le thème ${THEME_CATEGORY_LABELS[theme]}, maximum 2`,
      };
    }
  }

  const programmeText = formatProgrammeText(selectedReferences);
  // Coverage needs one measure per expected theme, never every measure the provider selected. When
  // it chose two, exempt the shorter one: the second is optional and remains inside the cap. Text
  // from a non-required theme is optional too and is never deducted.
  const exemptSourceTexts = plan.expectedThemes.map(
    (theme) =>
      selectedReferences
        .filter((reference) => reference.theme === theme)
        .map((reference) => sourceTextForQuote(reference.text))
        .sort((a, b) => wordCount(a) - wordCount(b))[0]!
  );
  return screenSynthesis({
    text: `${career}\n\n${programmeText}`,
    generatedText: career,
    exemptSourceTexts,
    material: synthesisMaterial(input),
  });
}

/**
 * Screens a generated synthesis before anything stores or displays it.
 *
 * Every rule here has a failure it prevents, in the order they actually happen:
 * a model that mentions a judicial case because it knows one, a model that pads to
 * reach a length, a model that reaches for the em dash it was told not to use.
 * A rejection is not a fallback to a degraded text: the caller stores nothing.
 */
export function screenSynthesis({
  text: raw,
  generatedText,
  exemptSourceTexts,
  material = {
    mandateCount: SUBSTANTIAL_MANDATES,
    voteCount: SUBSTANTIAL_VOTES,
    measureCount: SUBSTANTIAL_MEASURES,
  },
}: {
  /** Complete reader-facing text, including canonical source wording. */
  text: string;
  /** Provider-authored segment only. Judicial vocabulary is forbidden here, not in sources. */
  generatedText: string;
  /** One canonical source formulation per mandatory theme, excluded from the flexible maximum. */
  exemptSourceTexts: string[];
  /** Omitted, the strictest ordinary floor applies. */
  material?: SynthesisMaterial;
}): SynthesisScreen {
  const minWords = synthesisFloor(material);
  const text = raw.trim();
  if (text === "") return { ok: false, reason: "vide", detail: "le modèle n'a rien renvoyé" };

  // Long dashes are the most reported AI marker in French prose, and the house style
  // forbids them outright.
  const dash = /[—–]/.exec(text);
  if (dash) {
    return { ok: false, reason: "tiret_long", detail: `caractère « ${dash[0]} » interdit` };
  }

  // Judicial vocabulary is screened only in provider-authored prose. Canonical programme measures
  // may legitimately propose a tribunal or a parquet and are inserted after generation from a
  // reviewed source. Passing both segments explicitly makes that trust boundary hard to erase.
  //
  // Unicode lookarounds rather than `\b`, and that is not a style choice: `\b` sits
  // between a word character and a non-word one, and JavaScript counts `é` as a
  // non-word character. `\binéligibilité\b` therefore fails to match the very word it
  // names, which is how this pattern first shipped. Every term here is accented or
  // followed by one, so the whole family was affected.
  const judicial =
    /(?<!\p{L})(mises? en examen|condamn(?:é|ée|és|ées|ation|ations)|procès|enquête judiciaire|garde à vue|instruction judiciaire|tribunal|cour d'appel|parquet|inéligibilité)(?!\p{L})/iu.exec(
      generatedText
    );
  if (judicial) {
    return { ok: false, reason: "judiciaire", detail: `mention « ${judicial[0]} »` };
  }

  const words = wordCount(text);
  if (words < minWords) {
    return {
      ok: false,
      reason: "trop_court",
      detail: `${words} mots, minimum ${minWords}`,
    };
  }
  const maxWords = synthesisTargetRange(material).max;
  const absentSource = exemptSourceTexts.find((sourceText) => !text.includes(sourceText));
  if (absentSource) {
    return {
      ok: false,
      reason: "source_absente",
      detail: "le texte exclu du plafond ne figure pas dans la synthèse finale",
    };
  }
  const sourceWords = exemptSourceTexts.reduce(
    (total, sourceText) => total + wordCount(sourceText),
    0
  );
  const cappedWords = Math.max(0, words - sourceWords);
  if (cappedWords > maxWords) {
    return {
      ok: false,
      reason: "trop_long",
      detail: `${cappedWords} mots non sourcés, maximum ${maxWords}`,
    };
  }

  return { ok: true, text };
}

/**
 * Whether a stored synthesis has been contradicted by the measures published since.
 *
 * The synthesis is a snapshot: it is written from the measures the candidacy held on the day it
 * was generated, and nothing rewrites it when new ones are published. Most of that drift is
 * harmless — a text written from thirty measures and read beside forty is incomplete, not false,
 * and the block already dates itself so the reader can see how old it is.
 *
 * ONE case is not drift, it is an error: a synthesis written when the candidacy had NO published
 * measure. The system prompt tells the model to state an empty programme in one sentence rather
 * than pad, so those texts end on "aucune mesure n'est publiée dans le cadre de son programme" —
 * and the fiche went on printing that sentence directly above the five measures it had published
 * a fortnight later (observed on `nathalie-arthaud`, and on six other candidacies the same day).
 *
 * That state is detectable without storing anything extra, and exactly: if the EARLIEST currently
 * public measure of the candidacy was published after the synthesis was generated, then the
 * candidacy had none at all when the prompt was built, so its programme paragraph was written
 * about an empty programme. Checked against production, the predicate agreed with the seventeen
 * stored texts row for row — every one it flags claims an empty programme, and every one it keeps
 * describes measures.
 *
 * A contradicted synthesis is not repaired here and not shown with a caveat: it is dropped, and
 * the fiche renders without the block until a regeneration pass replaces it
 * (`scripts/generate-candidate-syntheses.ts`). Hedged wording around a false sentence still
 * publishes the false sentence.
 */
export function isSynthesisContradictedByMeasures(params: {
  generatedAt: Date | null;
  /** Publication date of the oldest measure the candidacy currently shows. Null when it shows none. */
  firstMeasurePublishedAt: Date | null;
}): boolean {
  // No measure on the fiche: an empty programme paragraph is what the page shows, so nothing
  // contradicts it.
  if (params.firstMeasurePublishedAt === null) return false;
  // A text we cannot date cannot be cleared. Every synthesis is written with its date by the
  // generation script, so a null here means a hand write or a partial one, and the measures below
  // are the surer thing.
  if (params.generatedAt === null) return true;
  return params.firstMeasurePublishedAt > params.generatedAt;
}
