/**
 * Affair AI Moderation Service
 *
 * Uses Claude Sonnet 4.5 with tool_use to analyze affairs before publication.
 * Each affair is evaluated for legal safety, data quality, and factual accuracy.
 *
 * IMPORTANT: Legal safety is critical.
 * - Presumption of innocence for all mise en examen
 * - CONDAMNATION_DEFINITIVE only if explicitly confirmed (appeal rejected / delays expired)
 * - Sensitive categories (AGRESSION_SEXUELLE, HARCELEMENT_SEXUEL, VIOLENCE) always force NEEDS_REVIEW
 * - When in doubt -> less severe value
 */

import { AI_RATE_LIMIT_MS } from "@/config/rate-limits";
import { callAnthropic, extractToolUse } from "@/lib/api/anthropic";
import { AffairStatus } from "@/generated/prisma";

const MODEL = "claude-sonnet-4-5-20250929";
const MAX_TOKENS = 2000;

// ============================================
// TYPES
// ============================================

export interface ModerationInput {
  affairId: string;
  title: string;
  description: string;
  status: string;
  category: string;
  involvement: string;
  politicianName: string;
  politicianSlug: string;
  sources: {
    url: string;
    title: string;
    publisher: string;
    publishedAt: string;
  }[];
  factsDate: string | null;
  startDate: string | null;
  verdictDate: string | null;
  court: string | null;
  sentence: string | null;
  existingAffairTitles?: string[];
  /** ISO date (YYYY-MM-DD) used as "today" for date checks. Defaults to the current date. */
  today?: string;
}

export interface ModerationIssue {
  type: (typeof ISSUE_TYPES)[number];
  detail: string;
}

export interface ModerationResult {
  recommendation: "PUBLISH" | "REJECT" | "NEEDS_REVIEW";
  confidence: number;
  reasoning: string;
  correctedTitle: string | null;
  correctedDescription: string | null;
  correctedStatus: string | null;
  correctedCategory: string | null;
  correctedInvolvement: string | null;
  issues: ModerationIssue[];
  model: string;
}

// ============================================
// CONSTANTS
// ============================================

export const SENSITIVE_CATEGORIES = new Set([
  "AGRESSION_SEXUELLE",
  "HARCELEMENT_SEXUEL",
  "VIOLENCE",
]);

// Dérivée de l'enum Prisma pour ne jamais diverger (#583) : une liste recopiée à la
// main a déjà omis POURVOI_EN_CASSATION, laissant une affaire non définitive sans
// garde valide pour une correction de statut appliquée sans revue.
export const AFFAIR_STATUSES = Object.values(AffairStatus);

export const AFFAIR_CATEGORIES = [
  "CORRUPTION",
  "CORRUPTION_PASSIVE",
  "TRAFIC_INFLUENCE",
  "PRISE_ILLEGALE_INTERETS",
  "FAVORITISME",
  "DETOURNEMENT_FONDS_PUBLICS",
  "FRAUDE_FISCALE",
  "BLANCHIMENT",
  "ABUS_BIENS_SOCIAUX",
  "ABUS_CONFIANCE",
  "EMPLOI_FICTIF",
  "FINANCEMENT_ILLEGAL_CAMPAGNE",
  "FINANCEMENT_ILLEGAL_PARTI",
  "HARCELEMENT_MORAL",
  "HARCELEMENT_SEXUEL",
  "AGRESSION_SEXUELLE",
  "VIOLENCE",
  "MENACE",
  "DIFFAMATION",
  "INJURE",
  "INCITATION_HAINE",
  "FAUX_ET_USAGE_FAUX",
  "RECEL",
  "CONFLIT_INTERETS",
  "AUTRE",
] as const;

export const INVOLVEMENTS = [
  "DIRECT",
  "INDIRECT",
  "MENTIONED_ONLY",
  "VICTIM",
  "PLAINTIFF",
] as const;

export const ISSUE_TYPES = [
  "MISSING_SOURCE",
  "POOR_DESCRIPTION",
  "WRONG_STATUS",
  "WRONG_CATEGORY",
  "SENSITIVE_CATEGORY",
  "POSSIBLE_DUPLICATE",
  "INVALID_DATES",
  "NOT_A_REAL_AFFAIR",
  "HOMONYM_RISK",
] as const;

// ============================================
// TOOL DEFINITION (Anthropic tool_use)
// ============================================

const MODERATION_TOOL = {
  name: "moderate_affair",
  description:
    "Modère une affaire judiciaire politique : vérifie la qualité des données, la conformité juridique, et recommande une action (publier, rejeter, ou révision manuelle).",
  input_schema: {
    type: "object" as const,
    properties: {
      recommendation: {
        type: "string",
        enum: ["PUBLISH", "REJECT", "NEEDS_REVIEW"],
        description:
          "Recommandation de modération. PUBLISH = données fiables, prêt à publier. REJECT = pas une vraie affaire ou données insuffisantes. NEEDS_REVIEW = cas sensible ou ambigu nécessitant une vérification humaine.",
      },
      confidence: {
        type: "integer",
        minimum: 0,
        maximum: 100,
        description:
          "Score de confiance (0-100) dans la recommandation. 90+ = très sûr. 70-89 = probable. 50-69 = incertain. <50 = faible confiance.",
      },
      reasoning: {
        type: "string",
        description:
          "Explication détaillée de la recommandation en français, incluant les points vérifiés et les problèmes détectés.",
      },
      corrected_title: {
        type: ["string", "null"],
        description:
          "Titre corrigé si nécessaire (nettoyé des marqueurs, capitalisé correctement). null si le titre est correct.",
      },
      corrected_description: {
        type: ["string", "null"],
        description:
          "Description corrigée si nécessaire (factuelle, 2-3 phrases, sans artéfacts IA). null si la description est correcte.",
      },
      corrected_status: {
        type: ["string", "null"],
        enum: [...AFFAIR_STATUSES, null],
        description:
          "Statut judiciaire corrigé si le statut actuel est incorrect au vu des sources. null si le statut est correct.",
      },
      corrected_category: {
        type: ["string", "null"],
        enum: [...AFFAIR_CATEGORIES, null],
        description:
          "Catégorie juridique corrigée si la catégorie actuelle est incorrecte. null si la catégorie est correcte.",
      },
      corrected_involvement: {
        type: ["string", "null"],
        enum: [...INVOLVEMENTS, null],
        description:
          "Implication corrigée si l'implication actuelle est incorrecte au vu des sources. Suggérer VICTIM si le politicien est victime des faits, PLAINTIFF s'il est plaignant. null si l'implication est correcte.",
      },
      issues: {
        type: "array",
        description: "Liste des problèmes détectés dans l'affaire.",
        items: {
          type: "object",
          properties: {
            type: {
              type: "string",
              enum: [...ISSUE_TYPES],
              description: "Type de problème détecté.",
            },
            detail: {
              type: "string",
              description: "Description du problème.",
            },
          },
          required: ["type", "detail"],
        },
      },
    },
    required: [
      "recommendation",
      "confidence",
      "reasoning",
      "corrected_title",
      "corrected_description",
      "corrected_status",
      "corrected_category",
      "corrected_involvement",
      "issues",
    ],
  },
};

// ============================================
// SYSTEM PROMPT
// ============================================

const SYSTEM_PROMPT = `Tu es un modérateur juridique pour Poligraph, un projet citoyen de transparence politique. Tu analyses des affaires judiciaires importées automatiquement pour décider si elles peuvent être publiées.

MISSION : Vérifier la qualité des données, la conformité juridique et la fiabilité de chaque affaire AVANT publication.

PÉRIMÈTRE ÉDITORIAL :

- Les affaires où le politicien est MIS EN CAUSE (prévenu, mis en examen, condamné) sont le cœur du périmètre
- Les affaires où le politicien est VICTIME ou PLAIGNANT sont AUSSI dans le périmètre éditorial. Ne JAMAIS recommander REJECT au seul motif que le politicien est victime ou plaignant
- Si l'implication renseignée est incorrecte (ex. MENTIONED_ONLY alors que les sources montrent que le politicien est victime des faits ou a déposé plainte), proposer corrected_involvement (VICTIM ou PLAINTIFF) au lieu de rejeter

RÈGLES STRICTES — SÉCURITÉ JURIDIQUE :

1. PRÉSOMPTION D'INNOCENCE : toute mise en examen reste une MISE_EN_EXAMEN. Ne JAMAIS suggérer CONDAMNATION sans preuve explicite dans les sources
2. CONDAMNATION_DEFINITIVE : UNIQUEMENT si les sources mentionnent EXPLICITEMENT que le pourvoi en cassation a été rejeté OU que les délais de recours sont expirés. Sinon → CONDAMNATION_PREMIERE_INSTANCE ou APPEL_EN_COURS
3. CATÉGORIES SENSIBLES (AGRESSION_SEXUELLE, HARCELEMENT_SEXUEL, VIOLENCE) : toujours recommander NEEDS_REVIEW, quel que soit le score de confiance. Ajouter un issue de type SENSITIVE_CATEGORY
4. NE JAMAIS INVENTER d'informations absentes des sources fournies
5. En cas de doute sur la catégorie → AUTRE ou signaler WRONG_CATEGORY
6. En cas de doute sur le statut → choisir la valeur MOINS GRAVE

CRITÈRES DE RECOMMANDATION :

PUBLISH (confiance >= 80) :
- Les sources sont valides et vérifiables (URLs de presse ou sources officielles)
- Le titre et la description sont factuels et neutres
- Le statut correspond aux informations des sources
- La catégorie est correcte et NON sensible
- Pas de risque d'homonymie évident

REJECT :
- Ce n'est pas une vraie affaire judiciaire (rumeur, polémique politique sans dimension judiciaire)
- Données manifestement insuffisantes (pas de source, description vide ou incohérente)
- Doublon évident d'une affaire existante
- Le politicien n'est ni mis en cause, ni victime, ni plaignant (simple mention contextuelle ou homonyme)

NEEDS_REVIEW :
- Catégorie sensible (AGRESSION_SEXUELLE, HARCELEMENT_SEXUEL, VIOLENCE) — TOUJOURS
- Sources ambiguës ou invérifiables
- Risque d'homonymie (nom commun, pas de contexte politique clair)
- Statut incertain entre deux valeurs
- Description contenant des artéfacts IA ou des formulations non neutres

NETTOYAGE DU TITRE :
- Supprimer les marqueurs "[À VÉRIFIER]", "[DRAFT]", "[AUTO]" ou similaires
- Capitaliser correctement (première lettre majuscule, reste en minuscules sauf noms propres)
- Format attendu : "Affaire des emplois fictifs du MoDem" ou "Mise en examen de X pour corruption"
- Si le titre est déjà correct, retourner null

NETTOYAGE DE LA DESCRIPTION :
- Supprimer les artéfacts IA ("le titre est tronqué...", "d'après l'analyse...", "cette affaire concerne potentiellement...")
- Rédiger une description factuelle en 2-3 phrases si l'actuelle est de mauvaise qualité
- Ton neutre et factuel, pas de jugement de valeur
- Si la description est déjà correcte, retourner null

IMPLICATION DU POLITICIEN :
- VICTIM et PLAINTIFF : ces affaires présentent MOINS de risque juridique car le politicien n'est pas mis en cause. Être plus souple sur la recommandation PUBLISH pour ces cas
- DIRECT : risque de diffamation maximal, vérification stricte
- INDIRECT et MENTIONED_ONLY : vérifier que l'implication est correctement qualifiée et proposer corrected_involvement si elle est fausse

VÉRIFICATION DES DATES :
- Le message fournit la « Date du jour » : comparer TOUTE date à cette référence, JAMAIS à tes connaissances internes
- Une date antérieure ou égale à la date du jour n'est PAS une date future
- factsDate doit être antérieure ou égale à startDate (les faits précèdent la médiatisation)
- verdictDate doit être postérieure à factsDate
- Si les dates sont incohérentes entre elles ou réellement postérieures à la date du jour, signaler INVALID_DATES

DÉTECTION DE DOUBLONS :
- Si la liste d'affaires existantes du même politicien contient un titre similaire, signaler POSSIBLE_DUPLICATE`;

// ============================================
// MAIN MODERATION FUNCTION
// ============================================

/**
 * Moderate an affair using Claude Sonnet 4.5 tool_use.
 * Returns a structured recommendation (PUBLISH / REJECT / NEEDS_REVIEW).
 */
export async function moderateAffair(input: ModerationInput): Promise<ModerationResult> {
  const today = input.today ?? new Date().toISOString().slice(0, 10);

  // Build user message with all affair data
  let userContent = `Date du jour : ${today}\n`;
  userContent += `\nModère cette affaire judiciaire :\n`;
  userContent += `\nPoliticien : ${input.politicianName} (slug: ${input.politicianSlug})`;
  userContent += `\nTitre : ${input.title}`;
  userContent += `\nDescription : ${input.description}`;
  userContent += `\nStatut : ${input.status}`;
  userContent += `\nCatégorie : ${input.category}`;
  userContent += `\nImplication : ${input.involvement}`;

  if (input.factsDate) {
    userContent += `\nDate des faits : ${input.factsDate}`;
  }
  if (input.startDate) {
    userContent += `\nDate de début : ${input.startDate}`;
  }
  if (input.verdictDate) {
    userContent += `\nDate du verdict : ${input.verdictDate}`;
  }
  if (input.court) {
    userContent += `\nJuridiction : ${input.court}`;
  }
  if (input.sentence) {
    userContent += `\nPeine : ${input.sentence}`;
  }

  // Sources
  if (input.sources.length > 0) {
    userContent += `\n\nSources (${input.sources.length}) :`;
    for (const source of input.sources) {
      userContent += `\n- "${source.title}" (${source.publisher}, ${source.publishedAt}) — ${source.url}`;
    }
  } else {
    userContent += `\n\nAucune source fournie.`;
  }

  // Existing affairs for duplicate detection
  if (input.existingAffairTitles && input.existingAffairTitles.length > 0) {
    userContent += `\n\nAffaires existantes du même politicien :`;
    for (const title of input.existingAffairTitles) {
      userContent += `\n- ${title}`;
    }
  }

  const data = await callAnthropic([{ role: "user", content: userContent }], {
    model: MODEL,
    maxTokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    tools: [MODERATION_TOOL],
    toolChoice: { type: "tool", name: "moderate_affair" },
  });

  const result = extractToolUse(data) as Record<string, unknown> | null;
  if (!result) {
    throw new Error("No tool_use content in API response");
  }

  // Parse and validate the result
  const recommendation = validateEnum(
    result.recommendation as string,
    ["PUBLISH", "REJECT", "NEEDS_REVIEW"] as const,
    "NEEDS_REVIEW"
  );
  const confidence =
    typeof result.confidence === "number" ? Math.min(100, Math.max(0, result.confidence)) : 50;
  const reasoning = String(result.reasoning || "");

  const correctedTitle = result.corrected_title ? String(result.corrected_title) : null;
  const correctedDescription = result.corrected_description
    ? String(result.corrected_description)
    : null;
  const correctedStatus = result.corrected_status
    ? validateEnum(
        result.corrected_status as string,
        AFFAIR_STATUSES,
        null as unknown as (typeof AFFAIR_STATUSES)[number]
      )
    : null;
  const correctedCategory = result.corrected_category
    ? validateEnum(
        result.corrected_category as string,
        AFFAIR_CATEGORIES,
        null as unknown as (typeof AFFAIR_CATEGORIES)[number]
      )
    : null;
  const correctedInvolvement = result.corrected_involvement
    ? validateEnum(
        result.corrected_involvement as string,
        INVOLVEMENTS,
        null as unknown as (typeof INVOLVEMENTS)[number]
      )
    : null;

  const issues: ModerationIssue[] = Array.isArray(result.issues)
    ? result.issues
        .filter(
          (i: Record<string, unknown>) =>
            i && typeof i.type === "string" && typeof i.detail === "string"
        )
        .map((i: Record<string, unknown>) => ({
          type: validateEnum(
            i.type as string,
            ISSUE_TYPES,
            "POOR_DESCRIPTION" as (typeof ISSUE_TYPES)[number]
          ),
          detail: String(i.detail),
        }))
    : [];

  // CRITICAL: Force NEEDS_REVIEW for sensitive categories regardless of AI output
  const effectiveCategory = correctedCategory || input.category;
  let finalRecommendation = recommendation;

  if (SENSITIVE_CATEGORIES.has(effectiveCategory)) {
    finalRecommendation = "NEEDS_REVIEW";

    // Add SENSITIVE_CATEGORY issue if not already present
    const hasSensitiveIssue = issues.some((i) => i.type === "SENSITIVE_CATEGORY");
    if (!hasSensitiveIssue) {
      issues.push({
        type: "SENSITIVE_CATEGORY",
        detail: `La catégorie "${effectiveCategory}" est sensible et nécessite une vérification humaine obligatoire.`,
      });
    }
  }

  return {
    recommendation: finalRecommendation,
    confidence,
    reasoning,
    correctedTitle,
    correctedDescription,
    correctedStatus,
    correctedCategory,
    correctedInvolvement,
    issues,
    model: MODEL,
  };
}

// ============================================
// HELPERS
// ============================================

/**
 * Get the rate limit delay for AI calls.
 */
export function getAIRateLimitMs(): number {
  return AI_RATE_LIMIT_MS;
}

/**
 * Check if a category is sensitive (requires human review).
 */
export function isSensitiveCategory(category: string): boolean {
  return SENSITIVE_CATEGORIES.has(category);
}

function validateEnum<T extends string>(value: string, validValues: readonly T[], fallback: T): T {
  if ((validValues as readonly string[]).includes(value)) {
    return value as T;
  }
  return fallback;
}
