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
 * The full-material target is still 90, so nothing changes for the candidacies that were already
 * passing. Checked against the twenty declared candidacies in production, every stored synthesis
 * clears its own floor, the tightest margin being 27 words against a floor of 25.
 */
export const SYNTHESIS_MAX_WORDS = 200;

/** Target terms: the identity sentence, then a paragraph per section, in two steps each. */
export const TARGET_BASE = 25;
export const TARGET_THIN_CAREER = 15;
export const TARGET_CAREER = 30;
export const TARGET_FEW_MEASURES = 15;
export const TARGET_MEASURES = 35;

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
      : material.measureCount >= SUBSTANTIAL_MEASURES
        ? TARGET_MEASURES
        : TARGET_FEW_MEASURES;
  return { min: TARGET_BASE + career + programme, max: SYNTHESIS_MAX_WORDS };
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

Forme :
- Français, avec tous les accents.
- Deux paragraphes : le parcours d'abord, le programme ensuite.
- Entre ${synthesisTargetRange(material).min} et ${synthesisTargetRange(material).max} mots au total.
- Aucun tiret cadratin ni demi-cadratin. Utilise virgules, parenthèses ou deux-points.
- Pas de phrase de conclusion générale du type « une candidature qui entend peser ». Termine sur un fait.
- Si le parcours ou le programme est vide, dis-le en une phrase simple plutôt que de meubler.

Réponds uniquement par le texte de la synthèse, sans titre ni préambule.`;
}

export function buildCandidateSynthesisPrompt(input: CandidateSynthesisInput): string {
  const mandates =
    input.mandates.length > 0
      ? input.mandates.map(formatMandate).join("\n")
      : "Aucun mandat enregistré sur le site.";

  const byTheme = new Map<ThemeCategory, string[]>();
  for (const measure of input.measures) {
    if (!byTheme.has(measure.theme)) byTheme.set(measure.theme, []);
    byTheme.get(measure.theme)!.push(safe(measure.text));
  }
  const measures =
    byTheme.size > 0
      ? [...byTheme.entries()]
          .map(
            ([theme, texts]) =>
              `${THEME_CATEGORY_LABELS[theme]} :\n${texts.map((t) => `  - ${t}`).join("\n")}`
          )
          .join("\n")
      : "Aucune mesure publiée pour cette candidature.";

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
${measures}
</programme>

Rédige la synthèse.`;
}

export type SynthesisScreen =
  | { ok: true; text: string }
  | { ok: false; reason: string; detail: string };

/**
 * Screens a generated synthesis before anything stores or displays it.
 *
 * Every rule here has a failure it prevents, in the order they actually happen:
 * a model that mentions a judicial case because it knows one, a model that pads to
 * reach a length, a model that reaches for the em dash it was told not to use.
 * A rejection is not a fallback to a degraded text: the caller stores nothing.
 */
export function screenSynthesis(
  raw: string,
  /**
   * The material the text was written from. Omitted, it defaults to the richest case, which is the
   * strictest floor: a caller that forgets to say gets the demanding answer rather than a free pass.
   */
  material: SynthesisMaterial = {
    mandateCount: SUBSTANTIAL_MANDATES,
    voteCount: SUBSTANTIAL_VOTES,
    measureCount: SUBSTANTIAL_MEASURES,
  }
): SynthesisScreen {
  const minWords = synthesisFloor(material);
  const text = raw.trim();
  if (text === "") return { ok: false, reason: "vide", detail: "le modèle n'a rien renvoyé" };

  // Long dashes are the most reported AI marker in French prose, and the house style
  // forbids them outright.
  const dash = /[—–]/.exec(text);
  if (dash) {
    return { ok: false, reason: "tiret_long", detail: `caractère « ${dash[0]} » interdit` };
  }

  // Judicial vocabulary. A synthesis that mentions a case is not edited down, it is
  // thrown away: the model was told plainly, and a text that ignored that rule cannot
  // be trusted on the rest either.
  //
  // Unicode lookarounds rather than `\b`, and that is not a style choice: `\b` sits
  // between a word character and a non-word one, and JavaScript counts `é` as a
  // non-word character. `\binéligibilité\b` therefore fails to match the very word it
  // names, which is how this pattern first shipped. Every term here is accented or
  // followed by one, so the whole family was affected.
  const judicial =
    /(?<!\p{L})(mises? en examen|condamn(?:é|ée|és|ées|ation|ations)|procès|enquête judiciaire|garde à vue|instruction judiciaire|tribunal|cour d'appel|parquet|inéligibilité)(?!\p{L})/iu.exec(
      text
    );
  if (judicial) {
    return { ok: false, reason: "judiciaire", detail: `mention « ${judicial[0]} »` };
  }

  const words = text.split(/\s+/).filter(Boolean).length;
  if (words < minWords) {
    return {
      ok: false,
      reason: "trop_court",
      detail: `${words} mots, minimum ${minWords}`,
    };
  }
  if (words > SYNTHESIS_MAX_WORDS) {
    return {
      ok: false,
      reason: "trop_long",
      detail: `${words} mots, maximum ${SYNTHESIS_MAX_WORDS}`,
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
