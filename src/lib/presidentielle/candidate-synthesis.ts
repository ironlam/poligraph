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
 * Word bounds, and why there are two floors rather than one.
 *
 * A single high floor contradicts the instruction the model is given. It is told to
 * state an empty record in one sentence rather than pad, and a candidacy we have not
 * yet documented has nothing to say about its programme: on a first run, thirteen of
 * twenty candidacies came back between 27 and 75 words, all of them correct, all of
 * them rejected by a 90-word floor. The floor was punishing the model for obeying.
 *
 * So the floor follows the material. With measures to summarise, a text under 90
 * words is thin and something went wrong. Without them, brevity is the honest answer
 * and only an empty one is a failure.
 */
export const SYNTHESIS_MIN_WORDS = 90;
export const SYNTHESIS_MIN_WORDS_WITHOUT_MEASURES = 25;
export const SYNTHESIS_MAX_WORDS = 200;

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

export const SYNTHESIS_SYSTEM_PROMPT = `Tu rédiges pour Poligraph, un site français de transparence politique. Ta tâche est une synthèse factuelle du parcours et du programme d'une candidature à l'élection présidentielle.

Règles absolues :
- N'écris RIEN qui ne figure pas dans les données fournies. Aucune connaissance extérieure, aucune inférence sur les intentions, aucune prévision.
- Ne mentionne AUCUNE affaire judiciaire, enquête, mise en examen ou condamnation, même si tu en connais. Ce n'est pas le sujet de ce texte et c'est traité ailleurs sur le site.
- Aucun jugement de valeur, aucun qualificatif d'appréciation. Ni « ambitieux », ni « radical », ni « crédible », ni « clivant ». Décris, ne commente pas.
- Aucune comparaison avec un autre candidat.
- Ne compte pas les mesures et ne dis pas combien il y en a : le chiffre est affiché à côté et il bougera.

Forme :
- Français, avec tous les accents.
- Deux paragraphes : le parcours d'abord, le programme ensuite.
- Entre ${SYNTHESIS_MIN_WORDS} et ${SYNTHESIS_MAX_WORDS} mots au total.
- Aucun tiret cadratin ni demi-cadratin. Utilise virgules, parenthèses ou deux-points.
- Pas de phrase de conclusion générale du type « une candidature qui entend peser ». Termine sur un fait.
- Si le parcours ou le programme est vide, dis-le en une phrase simple plutôt que de meubler.

Réponds uniquement par le texte de la synthèse, sans titre ni préambule.`;

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
  options: { hasMeasures?: boolean } = {}
): SynthesisScreen {
  const minWords =
    options.hasMeasures === false ? SYNTHESIS_MIN_WORDS_WITHOUT_MEASURES : SYNTHESIS_MIN_WORDS;
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
