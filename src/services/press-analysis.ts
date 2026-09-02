/**
 * Press Article AI Analysis Service
 *
 * Two-tier model: Mistral Large for judicial articles (TIER_1), Mistral Small for others (TIER_2).
 * Uses Mistral JSON mode to extract structured data: affair detection, category, status, key excerpts.
 *
 * IMPORTANT: Legal safety is critical.
 * - Presumption of innocence for all mise en examen
 * - CONDAMNATION_DEFINITIVE only if article explicitly mentions rejected appeal
 * - Sensitive categories (AGRESSION_SEXUELLE, HARCELEMENT_SEXUEL, VIOL) only if facts are explicitly described
 * - When in doubt → less severe value
 */

import { AI_RATE_LIMIT_MS } from "@/config/rate-limits";
import { clampConfidenceScore } from "@/services/affairs/confidence";
import { callMistral, extractMistralText, parseMistralJSON } from "@/lib/api/mistral";

const TIER_MODELS = {
  TIER_1: "mistral-large-latest",
  TIER_2: "mistral-small-latest",
} as const;

type AnalysisTier = keyof typeof TIER_MODELS;

const MAX_TOKENS = 2000;

// ============================================
// TYPES
// ============================================

export interface ArticleAnalysisInput {
  title: string;
  content: string;
  feedSource: string;
  publishedAt: Date;
  mentionedPoliticians?: string[];
  tier?: "TIER_1" | "TIER_2";
}

export interface ArticleAnalysisResult {
  isAffairRelated: boolean;
  summary: string;
  affairs: DetectedAffair[];
}

export interface DetectedAffair {
  politicianName: string;
  involvement: "DIRECT" | "INDIRECT" | "MENTIONED_ONLY" | "VICTIM" | "PLAINTIFF";
  category: string;
  /** False when an unknown model value was replaced by the conservative fallback. */
  categoryValidated?: boolean;
  status: string;
  /** Required for evolution routing, where a fallback would create a false match. */
  statusValidated?: boolean;
  title: string;
  description: string;
  factsDate: string | null;
  court: string | null;
  charges: string[];
  excerpts: string[];
  isNewRevelation: boolean;
  confidenceScore: number;
  /** Names extracted from the article text (hint for the resolver, no DB lookup) */
  mentionedNames: string[];
}

// ============================================
// AFFAIR CATEGORIES & STATUS (enum values)
// ============================================

const AFFAIR_CATEGORIES = [
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

const AFFAIR_STATUSES = [
  "ENQUETE_PRELIMINAIRE",
  "INSTRUCTION",
  "MISE_EN_EXAMEN",
  "RENVOI_TRIBUNAL",
  "PROCES_EN_COURS",
  "CONDAMNATION_PREMIERE_INSTANCE",
  "APPEL_EN_COURS",
  "CONDAMNATION_DEFINITIVE",
  "RELAXE",
  "ACQUITTEMENT",
  "NON_LIEU",
  "PRESCRIPTION",
  "CLASSEMENT_SANS_SUITE",
] as const;

const SENSITIVE_CATEGORIES = new Set(["AGRESSION_SEXUELLE", "HARCELEMENT_SEXUEL"]);

// ============================================
// SYSTEM PROMPT
// ============================================

const SYSTEM_PROMPT = `Tu es un analyste juridique spécialisé en affaires judiciaires politiques françaises. Tu analyses des articles de presse pour en extraire les informations sur les affaires judiciaires.

RÈGLES STRICTES :
1. PRÉSOMPTION D'INNOCENCE : toute mise en examen est une MISE_EN_EXAMEN, pas une condamnation
2. CONDAMNATION_DEFINITIVE : UNIQUEMENT si l'article mentionne EXPLICITEMENT que le pourvoi en cassation a été rejeté OU que les délais de recours sont expirés. En cas de doute → CONDAMNATION_PREMIERE_INSTANCE ou APPEL_EN_COURS
3. CATÉGORIES SENSIBLES (AGRESSION_SEXUELLE, HARCELEMENT_SEXUEL) : UNIQUEMENT si les faits reprochés sont EXPLICITEMENT décrits dans l'article. Ne PAS déduire la catégorie à partir du contexte seul
4. NE JAMAIS INVENTER d'informations absentes de l'article
5. En cas de doute sur la catégorie → AUTRE
6. En cas de doute sur le statut → choisir la valeur MOINS GRAVE
7. Les excerpts doivent être des CITATIONS EXACTES de l'article (mot pour mot)
8. Si l'article ne contient pas d'affaire judiciaire, retourner is_affair_related: false avec un résumé simple

RÈGLE CRITIQUE — IMPLICATION DIRECTE :
9. Un politicien doit être DIRECTEMENT MIS EN CAUSE (mis en examen, poursuivi, condamné, placé en garde à vue) pour avoir involvement: "DIRECT". Un politicien simplement MENTIONNÉ dans l'article (réaction politique, commentaire, contexte, autre sujet) → involvement: MENTIONED_ONLY
10. Si l'article parle d'une affaire où le politicien est VICTIME (menaces, agressions, cambriolage) → involvement: VICTIM. S'il a déposé plainte → PLAINTIFF. S'il est simple TÉMOIN ou commentateur → INDIRECT ou MENTIONED_ONLY
11. Si un article mentionne un politicien dans un contexte politique (débat, vote, déclaration) et qu'une affaire judiciaire est mentionnée séparément dans le même article, NE PAS attribuer l'affaire au politicien

SCORE DE CONFIANCE (confidence_score) :
- 90-100 : le politicien est NOMMÉMENT cité comme mis en cause/condamné/poursuivi dans l'article
- 70-89 : le politicien est fortement lié à l'affaire mais le rôle n'est pas 100% explicite
- 50-69 : mention ambiguë, le lien entre le politicien et l'affaire n'est pas clair
- 0-49 : le politicien est probablement juste mentionné, pas impliqué

EXEMPLES DE FAUX POSITIFS À ÉVITER :
- Un article sur "la mort de X" qui mentionne la réaction d'un politicien → le politicien n'est PAS impliqué dans la mort
- Un article sur une affaire judiciaire qui cite un politicien comme source ou commentateur → MENTIONED_ONLY
- Un article politique mentionnant en passant un procès en cours d'un autre politicien → seul le politicien poursuivi est DIRECT

RÈGLE — NOMS MENTIONNÉS :
12. Dans chaque affaire, le champ "mentioned_names" doit contenir les noms complets (prénom + nom) des personnes citées dans l'article en lien avec cette affaire. Liste les noms tels qu'ils apparaissent dans le texte, sans tenter de les associer à des identifiants. Exemples : ["Jean Dupont", "Marie Martin"]. Si aucun nom complet n'est lisible, retourner [].

RÉPONSE : Tu DOIS répondre en JSON avec exactement ces champs :
{
  "is_affair_related": boolean,
  "summary": "Résumé factuel en 2-3 phrases",
  "affairs": [
    {
      "politician_name": "Nom complet (ex: Nicolas Sarkozy)",
      "involvement": "DIRECT | INDIRECT | MENTIONED_ONLY | VICTIM | PLAINTIFF",
      "category": "${AFFAIR_CATEGORIES.join(" | ")}",
      "status": "${AFFAIR_STATUSES.join(" | ")}",
      "title": "Titre court de l'affaire",
      "description": "Description factuelle en 2-3 phrases",
      "facts_date": "YYYY-MM-DD ou null",
      "court": "Juridiction ou null",
      "charges": ["chef d'accusation 1", "..."],
      "excerpts": ["citation exacte 1", "citation exacte 2"],
      "is_new_revelation": boolean,
      "confidence_score": 0-100,
      "mentioned_names": ["Prénom Nom", "..."]
    }
  ]
}
Si aucune affaire judiciaire n'est détectée, retourner : {"is_affair_related": false, "summary": "...", "affairs": []}`;

// ============================================
// MAIN ANALYSIS FUNCTION
// ============================================

/**
 * Analyze a press article for judicial affairs using Mistral JSON mode
 */
export async function analyzeArticle(input: ArticleAnalysisInput): Promise<ArticleAnalysisResult> {
  const tier: AnalysisTier = input.tier || "TIER_2";
  const model = TIER_MODELS[tier];

  let userContent = `Analyse cet article de presse politique :\n\nTitre : ${input.title}\nSource : ${input.feedSource}\nDate : ${input.publishedAt.toISOString().split("T")[0]}\n\nContenu :\n${input.content}`;

  if (input.mentionedPoliticians && input.mentionedPoliticians.length > 0) {
    userContent += `\n\nPoliticiens mentionnés (pré-détectés) : ${input.mentionedPoliticians.join(", ")}`;
  }

  const data = await callMistral([{ role: "user", content: userContent }], {
    model,
    maxTokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    temperature: 0.2,
    responseFormat: { type: "json_object" },
  });

  const text = extractMistralText(data);
  const result = parseMistralJSON<Record<string, unknown>>(text);
  if (!result) {
    throw new Error("Empty JSON response from Mistral API");
  }

  // Validate and sanitize the result
  const affairs: DetectedAffair[] = ((result.affairs as Record<string, unknown>[]) || []).map(
    (a: Record<string, unknown>) => {
      const categoryValidated = isEnumValue(a.category as string, AFFAIR_CATEGORIES);
      const statusValidated = isEnumValue(a.status as string, AFFAIR_STATUSES);
      const category = validateEnum(a.category as string, AFFAIR_CATEGORIES, "AUTRE");
      const status = validateEnum(a.status as string, AFFAIR_STATUSES, "ENQUETE_PRELIMINAIRE");
      const involvement = validateEnum(
        a.involvement as string,
        ["DIRECT", "INDIRECT", "MENTIONED_ONLY", "VICTIM", "PLAINTIFF"] as const,
        "MENTIONED_ONLY"
      );

      return {
        politicianName: String(a.politician_name || ""),
        involvement,
        category,
        categoryValidated,
        status,
        statusValidated,
        title: String(a.title || ""),
        description: String(a.description || ""),
        factsDate: a.facts_date ? String(a.facts_date) : null,
        court: a.court ? String(a.court) : null,
        charges: Array.isArray(a.charges) ? a.charges.map(String) : [],
        excerpts: Array.isArray(a.excerpts) ? a.excerpts.map(String).slice(0, 3) : [],
        isNewRevelation: Boolean(a.is_new_revelation),
        confidenceScore: clampConfidenceScore(
          typeof a.confidence_score === "number" ? a.confidence_score : 50
        ),
        mentionedNames: Array.isArray(a.mentioned_names) ? a.mentioned_names.map(String) : [],
      };
    }
  );

  return {
    isAffairRelated: Boolean(result.is_affair_related),
    summary: String(result.summary || ""),
    affairs,
  };
}

/**
 * Check if a detected affair has a sensitive category
 */
export function isSensitiveCategory(category: string): boolean {
  return SENSITIVE_CATEGORIES.has(category);
}

/**
 * Get the rate limit delay for AI calls
 */
export function getAIRateLimitMs(): number {
  return AI_RATE_LIMIT_MS;
}

// ============================================
// HELPERS
// ============================================

function validateEnum<T extends string>(value: string, validValues: readonly T[], fallback: T): T {
  if ((validValues as readonly string[]).includes(value)) {
    return value as T;
  }
  return fallback;
}

function isEnumValue<T extends string>(value: string, validValues: readonly T[]): value is T {
  return (validValues as readonly string[]).includes(value);
}
