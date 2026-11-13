/**
 * Theme classification for legislative dossiers and scrutins.
 *
 * Taxonomic classification over existing text (not content generation) into one
 * of 13 controlled theme values. Mistral is the primary provider; when it fails
 * (quota/rate-limit/server/network), the call falls back to Anthropic (Claude
 * Haiku, tool-use) so a single-provider outage doesn't break the daily sync.
 * The returned theme is always validated against THEME_VALUES, so a bad answer
 * from either provider degrades to null rather than corrupting data.
 *
 * Mistral went first on 2026-11-13: the Anthropic account had been out of credit
 * for months, so every classification paid a failed Anthropic call and a warning
 * before Mistral answered anyway. The shadow eval comparing both providers on a
 * sample was never run.
 */

import { callAnthropic, extractToolUse } from "@/lib/api/anthropic";
import { callMistral, extractMistralText, parseMistralJSON } from "@/lib/api/mistral";

const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";
const MISTRAL_MODEL = "mistral-small-latest";

const THEME_VALUES = [
  "ECONOMIE_BUDGET",
  "SOCIAL_TRAVAIL",
  "SECURITE_JUSTICE",
  "ENVIRONNEMENT_ENERGIE",
  "SANTE",
  "EDUCATION_CULTURE",
  "INSTITUTIONS",
  "AFFAIRES_ETRANGERES_DEFENSE",
  "NUMERIQUE_TECH",
  "IMMIGRATION",
  "AGRICULTURE_ALIMENTATION",
  "LOGEMENT_URBANISME",
  "TRANSPORTS",
] as const;

export type ThemeCategoryValue = (typeof THEME_VALUES)[number];

// AI may still rarely return inverted names despite the enum constraint.
const THEME_ALIASES: Record<string, ThemeCategoryValue> = {
  CULTURE_EDUCATION: "EDUCATION_CULTURE",
  JUSTICE_SECURITE: "SECURITE_JUSTICE",
  CULTURE_PATRIMOINE: "EDUCATION_CULTURE",
  BUDGET_ECONOMIE: "ECONOMIE_BUDGET",
  TRAVAIL_SOCIAL: "SOCIAL_TRAVAIL",
  ENERGIE_ENVIRONNEMENT: "ENVIRONNEMENT_ENERGIE",
  DEFENSE_AFFAIRES_ETRANGERES: "AFFAIRES_ETRANGERES_DEFENSE",
  TECH_NUMERIQUE: "NUMERIQUE_TECH",
  ALIMENTATION_AGRICULTURE: "AGRICULTURE_ALIMENTATION",
  URBANISME_LOGEMENT: "LOGEMENT_URBANISME",
};

const CATEGORY_GUIDE = `Guide des catégories :
- ECONOMIE_BUDGET : fiscalité, budget de l'État, finances publiques, commerce, entreprises
- SOCIAL_TRAVAIL : emploi, droit du travail, retraites, protection sociale, handicap
- SECURITE_JUSTICE : police, justice, pénal, prisons, terrorisme, ordre public
- ENVIRONNEMENT_ENERGIE : écologie, climat, énergie, biodiversité, pollution
- SANTE : santé publique, hôpitaux, médicaments, bioéthique, pandémies
- EDUCATION_CULTURE : éducation, université, recherche, culture, sport, médias
- INSTITUTIONS : Constitution, élections, collectivités, réforme de l'État, outre-mer
- AFFAIRES_ETRANGERES_DEFENSE : diplomatie, défense, armée, coopération internationale, UE
- NUMERIQUE_TECH : numérique, données, IA, télécommunications, cybersécurité
- IMMIGRATION : immigration, asile, nationalité, intégration, frontières
- AGRICULTURE_ALIMENTATION : agriculture, pêche, alimentation, ruralité
- LOGEMENT_URBANISME : logement, urbanisme, construction, copropriété
- TRANSPORTS : transports, mobilité, routes, ferroviaire, aérien, maritime`;

function buildInput(title: string, summary?: string | null, context?: string | null): string {
  let input = `Titre : ${title}`;
  if (summary) input += `\nRésumé : ${summary}`;
  if (context) input += `\nContexte : ${context}`;
  return input;
}

/**
 * Normalize a raw theme string (from either provider) into a controlled value:
 * apply known aliases, then validate against THEME_VALUES. Returns null (never
 * throws) for an unknown value, logging the raw answer and its source.
 */
function normalizeTheme(
  raw: string | undefined,
  source: "anthropic" | "mistral"
): ThemeCategoryValue | null {
  if (!raw) {
    console.warn(`[classify-theme] no theme returned from ${source}`);
    return null;
  }
  const theme = THEME_ALIASES[raw] ?? raw;
  if (THEME_VALUES.includes(theme as ThemeCategoryValue)) {
    return theme as ThemeCategoryValue;
  }
  console.warn(`[classify-theme] invalid theme from ${source} (raw="${raw}")`);
  return null;
}

/** Fallback path: Claude Haiku with a forced tool call. Throws on API failure or
 *  an empty (no tool_use) response. */
async function classifyViaAnthropic(input: string): Promise<string> {
  const prompt = `Tu es un classificateur thématique pour des textes législatifs français. Classe le texte suivant dans une catégorie en utilisant l'outil classify_theme.

${input}

${CATEGORY_GUIDE}`;

  const tools = [
    {
      name: "classify_theme",
      description: "Classifie un texte législatif dans une catégorie thématique.",
      input_schema: {
        type: "object" as const,
        properties: {
          theme: {
            type: "string",
            enum: [...THEME_VALUES],
            description: "La catégorie thématique du texte législatif",
          },
        },
        required: ["theme"],
      },
    },
  ];

  const data = await callAnthropic([{ role: "user", content: prompt }], {
    label: "classify-theme",
    model: ANTHROPIC_MODEL,
    maxTokens: 100,
    tools,
    toolChoice: { type: "tool", name: "classify_theme" },
  });

  const toolInput = extractToolUse(data) as { theme?: string } | null;
  if (!toolInput?.theme) {
    throw new Error("No tool_use content in Anthropic response");
  }
  return toolInput.theme;
}

/** Primary path: Mistral JSON mode. Returns the raw theme string (validated by
 *  the caller). Throws on API/parse failure.
 *  TODO: upgrade to response_format json_schema with a strict enum on
 *  THEME_VALUES once verified against mistral-small-latest. json_object is used
 *  here because it's robust and the output is validated downstream (null-safe). */
async function classifyViaMistral(input: string): Promise<string | undefined> {
  const prompt = `Tu es un classificateur thématique pour des textes législatifs français. Classe le texte suivant dans une seule catégorie.

${input}

${CATEGORY_GUIDE}

Réponds UNIQUEMENT avec un objet JSON de la forme {"theme": "<CATEGORIE>"} où <CATEGORIE> est exactement l'une de ces valeurs : ${THEME_VALUES.join(", ")}.`;

  const res = await callMistral([{ role: "user", content: prompt }], {
    model: MISTRAL_MODEL,
    maxTokens: 100,
    responseFormat: { type: "json_object" },
  });

  const parsed = parseMistralJSON<{ theme?: string }>(extractMistralText(res));
  return parsed?.theme;
}

/**
 * Classify a legislative text or scrutin into a theme category.
 * Mistral primary, Anthropic fallback. Returns null when neither produces a
 * valid theme value; throws only when BOTH providers fail outright.
 */
export async function classifyTheme(
  title: string,
  summary?: string | null,
  context?: string | null
): Promise<ThemeCategoryValue | null> {
  const input = buildInput(title, summary, context);

  let mistralError: string;
  try {
    const raw = await classifyViaMistral(input);
    return normalizeTheme(raw, "mistral");
  } catch (err) {
    mistralError = err instanceof Error ? err.message : String(err);
    // Fall back on ANY Mistral error, the missing-MISTRAL_API_KEY case included.
    // Telling a quota or rate limit from a genuine bad request precisely is
    // brittle and the output is validated (degrades to null), so for this single,
    // low-stakes classifier a broad fallback beats masking an outage. Logged loudly.
    console.warn(
      `[classify-theme] primary=mistral failed (${mistralError}); falling back to provider=anthropic`
    );
  }

  try {
    const raw = await classifyViaAnthropic(input);
    return normalizeTheme(raw, "anthropic");
  } catch (err) {
    const anthropicError = err instanceof Error ? err.message : String(err);
    // Both providers failed: surface an explicit error (never swallow silently).
    throw new Error(
      `Theme classification failed — mistral: ${mistralError}; anthropic fallback: ${anthropicError}`
    );
  }
}
