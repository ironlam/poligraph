/**
 * Wikipedia Affair Extraction Service
 *
 * Uses Claude Sonnet 4.5 tool_use to extract structured affair data
 * from Wikipedia wikitext sections about political controversies.
 *
 * IMPORTANT: Legal safety is critical.
 * - Presumption of innocence for all mise en examen
 * - CONDAMNATION_DEFINITIVE only if article explicitly mentions rejected appeal
 * - Sensitive categories (AGRESSION_SEXUELLE, HARCELEMENT_SEXUEL) only if facts are explicitly described
 * - Default involvement = MENTIONED_ONLY (most conservative)
 * - When in doubt → less severe value
 */

import { AI_RATE_LIMIT_MS } from "@/config/rate-limits";
import { clampConfidenceScore } from "@/services/affairs/confidence";
import { callAnthropic, extractToolUse } from "@/lib/api/anthropic";
import { AffairStatus } from "@/generated/prisma";

const MODEL = "claude-sonnet-4-5-20250929";
const MAX_TOKENS = 2000;
const MAX_WIKITEXT_CHARS = 8000;

// Module-level rate limiting
let lastCallTime = 0;

// ============================================
// TYPES
// ============================================

export interface WikipediaExtractionInput {
  politicianName: string;
  sectionTitle: string;
  wikitext: string;
  pageUrl: string;
}

export interface ExtractedAffair {
  title: string;
  description: string;
  category: string;
  status: string;
  involvement: "DIRECT" | "INDIRECT" | "MENTIONED_ONLY" | "VICTIM" | "PLAINTIFF";
  factsDate: string | null;
  court: string | null;
  charges: string[];
  confidenceScore: number;
  sourceUrls: string[];
}

export interface WikipediaExtractionResult {
  affairs: ExtractedAffair[];
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

// Dérivée de l'enum Prisma pour ne jamais diverger (#583).
const AFFAIR_STATUSES = Object.values(AffairStatus);

// ============================================
// TOOL DEFINITION (Anthropic tool_use)
// ============================================

const EXTRACTION_TOOL = {
  name: "extract_wikipedia_affairs",
  description:
    "Extrait les affaires judiciaires mentionnées dans une section Wikipedia d'un politicien français.",
  input_schema: {
    type: "object" as const,
    properties: {
      affairs: {
        type: "array",
        description:
          "Liste des affaires judiciaires distinctes extraites de la section Wikipedia. Tableau vide si aucune affaire judiciaire.",
        items: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description:
                "Titre court de l'affaire (ex: 'Affaire Bygmalion', 'Affaire des emplois fictifs du MoDem')",
            },
            description: {
              type: "string",
              description:
                "Description factuelle en 2-3 phrases basée uniquement sur le texte Wikipedia",
            },
            category: {
              type: "string",
              enum: [...AFFAIR_CATEGORIES],
              description: "Catégorie juridique de l'affaire",
            },
            status: {
              type: "string",
              enum: [...AFFAIR_STATUSES],
              description: "Statut judiciaire le plus récent mentionné dans le texte Wikipedia",
            },
            involvement: {
              type: "string",
              enum: ["DIRECT", "INDIRECT", "MENTIONED_ONLY", "VICTIM", "PLAINTIFF"],
              description:
                "Niveau d'implication du politicien. DIRECT = mis en cause, poursuivi, condamné. INDIRECT = témoin ou acteur secondaire. MENTIONED_ONLY = simplement cité sans lien direct avec l'affaire. VICTIM = le politicien est victime de l'infraction (menaces, agressions, cambriolage). PLAINTIFF = le politicien a déposé plainte.",
            },
            facts_date: {
              type: ["string", "null"],
              description:
                "Date des faits si mentionnée (format YYYY-MM-DD), null sinon. Si seule l'année est connue, utiliser YYYY-01-01.",
            },
            court: {
              type: ["string", "null"],
              description:
                "Juridiction mentionnée (ex: 'Tribunal correctionnel de Paris'), null sinon",
            },
            charges: {
              type: "array",
              items: { type: "string" },
              description: "Chefs d'accusation ou infractions mentionnés",
            },
            confidence_score: {
              type: "integer",
              minimum: 0,
              maximum: 100,
              description:
                "Score de confiance (0-100) que cette affaire est correctement identifiée et attribuée au politicien. 90+ = certain. 70-89 = probable. 50-69 = incertain. <50 = peu fiable.",
            },
            source_urls: {
              type: "array",
              items: { type: "string" },
              description:
                "URLs extraites des balises <ref> du wikitext qui soutiennent spécifiquement cette affaire. Inclure uniquement les URLs pertinentes à cette affaire précise.",
            },
          },
          required: [
            "title",
            "description",
            "category",
            "status",
            "involvement",
            "facts_date",
            "court",
            "charges",
            "confidence_score",
            "source_urls",
          ],
        },
      },
    },
    required: ["affairs"],
  },
};

// ============================================
// SYSTEM PROMPT
// ============================================

const SYSTEM_PROMPT = `Tu es un analyste juridique spécialisé en affaires judiciaires politiques françaises. Tu analyses des sections Wikipedia pour en extraire les informations sur les affaires judiciaires.

Le texte fourni est du wikitext Wikipedia. Il peut contenir :
- Des [[liens internes]] vers d'autres articles Wikipedia
- Des {{modèles}} Wikipedia (infobox, références, etc.)
- Des balises <ref> contenant des URLs de sources (articles de presse, documents officiels)
- Du formatage wiki (''' gras ''', '' italique '', == titres ==)

RÈGLES STRICTES :
1. PRÉSOMPTION D'INNOCENCE : toute mise en examen est une MISE_EN_EXAMEN, pas une condamnation
2. CONDAMNATION_DEFINITIVE : UNIQUEMENT si le texte mentionne EXPLICITEMENT que le pourvoi en cassation a été rejeté OU que les délais de recours sont expirés. En cas de doute → CONDAMNATION_PREMIERE_INSTANCE ou APPEL_EN_COURS
3. CATÉGORIES SENSIBLES (AGRESSION_SEXUELLE, HARCELEMENT_SEXUEL) : UNIQUEMENT si les faits reprochés sont EXPLICITEMENT décrits dans le texte. Ne PAS déduire la catégorie à partir du contexte seul
4. NE JAMAIS INVENTER d'informations absentes du texte Wikipedia
5. En cas de doute sur la catégorie → AUTRE
6. En cas de doute sur le statut → choisir la valeur MOINS GRAVE
7. Chaque affaire DISTINCTE = une entrée séparée dans le tableau
8. Le niveau d'implication par défaut est MENTIONED_ONLY. Utiliser DIRECT uniquement si le politicien est explicitement mis en cause, poursuivi ou condamné
9. Si la section ne contient aucune affaire judiciaire, retourner un tableau vide

EXTRACTION DES SOURCES :
- Chercher les URLs dans les balises <ref> du wikitext (ex: <ref>{{Lien web|url=https://...|...}}</ref> ou <ref>[https://... titre]</ref>)
- Inclure uniquement les URLs qui soutiennent spécifiquement chaque affaire
- Ne PAS inclure d'URLs inventées`;

// ============================================
// MAIN EXTRACTION FUNCTION
// ============================================

/**
 * Extract structured affair data from a Wikipedia wikitext section
 * using Claude Sonnet tool_use.
 */
export async function extractAffairsFromWikipedia(
  input: WikipediaExtractionInput
): Promise<WikipediaExtractionResult> {
  // Rate limiting
  const now = Date.now();
  const elapsed = now - lastCallTime;
  if (elapsed < AI_RATE_LIMIT_MS) {
    await new Promise((resolve) => setTimeout(resolve, AI_RATE_LIMIT_MS - elapsed));
  }
  lastCallTime = Date.now();

  // Truncate wikitext if too long
  const truncatedWikitext =
    input.wikitext.length > MAX_WIKITEXT_CHARS
      ? input.wikitext.slice(0, MAX_WIKITEXT_CHARS) + "\n[...texte tronqué...]"
      : input.wikitext;

  const userContent = `Analyse cette section Wikipedia du politicien ${input.politicianName} pour en extraire les affaires judiciaires.

Section : ${input.sectionTitle}
Page Wikipedia : ${input.pageUrl}

Wikitext :
${truncatedWikitext}`;

  try {
    const data = await callAnthropic([{ role: "user", content: userContent }], {
      model: MODEL,
      maxTokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      tools: [EXTRACTION_TOOL],
      toolChoice: { type: "tool", name: "extract_wikipedia_affairs" },
    });

    const result = extractToolUse(data) as Record<string, unknown> | null;
    if (!result) {
      throw new Error("No tool_use content in API response");
    }

    // Validate and map snake_case to camelCase
    const affairs: ExtractedAffair[] = ((result.affairs as Record<string, unknown>[]) || []).map(
      (a: Record<string, unknown>) => {
        const category = validateEnum(a.category as string, AFFAIR_CATEGORIES, "AUTRE");
        const status = validateEnum(a.status as string, AFFAIR_STATUSES, "ENQUETE_PRELIMINAIRE");
        const involvement = validateEnum(
          a.involvement as string,
          ["DIRECT", "INDIRECT", "MENTIONED_ONLY", "VICTIM", "PLAINTIFF"] as const,
          "MENTIONED_ONLY"
        );

        return {
          title: String(a.title || ""),
          description: String(a.description || ""),
          category,
          status,
          involvement,
          factsDate: a.facts_date ? String(a.facts_date) : null,
          court: a.court ? String(a.court) : null,
          charges: Array.isArray(a.charges) ? a.charges.map(String) : [],
          confidenceScore: clampConfidenceScore(
            typeof a.confidence_score === "number" ? a.confidence_score : 50
          ),
          sourceUrls: Array.isArray(a.source_urls) ? a.source_urls.map(String) : [],
        };
      }
    );

    return { affairs };
  } catch (error) {
    // Log but don't crash — return empty result on parsing errors
    if (error instanceof Error && error.message.startsWith("Anthropic API error:")) {
      throw error; // Re-throw API errors (rate limit, auth, etc.)
    }
    console.error(
      `[wikipedia-extraction] Failed to extract affairs for ${input.politicianName}:`,
      error
    );
    return { affairs: [] };
  }
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
