/**
 * AI enrichment of affair descriptions using existing DB data.
 *
 * Uses Haiku 4.5 for cost-effective text generation from structured data.
 * No web search — purely DB-driven context (mandates, party, sentence, other affairs).
 * Embeds internal markdown links to politician/party/affair pages.
 */

import { callAnthropic, extractToolUse } from "@/lib/api/anthropic";
import { classifySentenceSplit } from "@/lib/affairs/sentence-split";

const MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 1200;

// ============================================
// TYPES
// ============================================

export interface DescriptionEnrichmentInput {
  title: string;
  description: string;
  status: string;
  category: string;
  involvement: string;
  factsDate: string | null;
  verdictDate: string | null;
  court: string | null;
  prisonMonths: number | null;
  prisonFirmMonths: number | null;
  fineAmount: number | null;
  ineligibilityMonths: number | null;
  ineligibilityFirmMonths: number | null;
  communityService: number | null;
  otherSentence: string | null;
  sentence: string | null;

  politicianFullName: string;
  politicianSlug: string;
  politicianCivility: string | null;
  currentMandates: string[];

  partyAtTimeName: string | null;
  partyAtTimeSlug: string | null;
  currentPartyName: string | null;
  currentPartySlug: string | null;

  otherAffairs: Array<{ title: string; slug: string }>;
}

export interface DescriptionEnrichmentOutput {
  enrichedDescription: string;
  confidence: number;
}

// ============================================
// TOOL DEFINITION
// ============================================

const ENRICHMENT_TOOL = {
  name: "enrich_description",
  description:
    "Enrichit la description d'une affaire judiciaire avec du contexte politique et des liens internes Poligraph.",
  input_schema: {
    type: "object" as const,
    properties: {
      enriched_description: {
        type: "string",
        description:
          "Description enrichie en markdown (150-300 mots). " +
          "Inclure des liens internes au format [texte](/chemin). " +
          "Liens autorisés : [Prénom Nom](/politiques/slug), [Parti](/partis/slug), [titre affaire](/affaires/slug). " +
          "Structure : contexte politique du personnage, puis faits, puis procédure, puis issue/verdict si applicable.",
      },
      confidence: {
        type: "integer",
        minimum: 0,
        maximum: 100,
        description:
          "Confiance dans la qualité de l'enrichissement (0-100). " +
          "80+ si les données sont suffisantes pour un texte complet. " +
          "50-79 si le texte est correct mais manque de détails. " +
          "< 50 si les données sont trop minces.",
      },
    },
    required: ["enriched_description", "confidence"],
  },
};

const SYSTEM_PROMPT = `Tu es un rédacteur factuel pour Poligraph, un observatoire citoyen de la politique française.

MISSION : Enrichir la description d'une affaire judiciaire à partir EXCLUSIVEMENT des données structurées fournies. Ne JAMAIS inventer d'information.

FORMAT :
- 150 à 300 mots, en français
- Ton neutre et factuel, style encyclopédique
- Structure : contexte politique → faits → procédure → issue/verdict → conséquences
- Présomption d'innocence pour les affaires non définitivement jugées

LIENS INTERNES (markdown) :
- Politicien : [Prénom Nom](/politiques/slug) — à la première mention seulement
- Parti : [Nom du parti](/partis/slug) — si pertinent au contexte
- Autre affaire du même politicien : [titre court](/affaires/slug) — si pertinent (max 1-2 mentions)
- N'utiliser QUE les slugs fournis dans les données

RÈGLES STRICTES :
1. N'invente AUCUNE information absente des données fournies
2. Pas de jugement moral ou politique
3. Pour les mises en examen : conditionnel et rappel de la présomption d'innocence
4. Ne PAS utiliser "selon nos informations" ou formules journalistiques
5. Si les données sont trop minces pour 150 mots, écrire ce qui est possible sans inventer (confidence < 50)
6. Ne PAS inclure "[À VÉRIFIER]" dans le texte
7. Commencer directement par le contexte, pas par "Cette affaire..." ou "Il s'agit de..."`;

// ============================================
// MAIN FUNCTION
// ============================================

export async function enrichDescription(
  input: DescriptionEnrichmentInput
): Promise<DescriptionEnrichmentOutput> {
  const userMessage = buildUserMessage(input);
  const validSlugs = buildValidSlugs(input);

  const response = await callAnthropic([{ role: "user", content: userMessage }], {
    model: MODEL,
    maxTokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    tools: [ENRICHMENT_TOOL],
    toolChoice: { type: "tool", name: "enrich_description" },
  });

  const output = extractToolUse(response) as {
    enriched_description: string;
    confidence: number;
  } | null;
  if (!output) {
    return { enrichedDescription: input.description, confidence: 0 };
  }

  // Validate and sanitize links
  const validated = validateLinks(output.enriched_description, validSlugs);

  return {
    enrichedDescription: validated,
    confidence: output.confidence ?? 0,
  };
}

// ============================================
// HELPERS
// ============================================

/**
 * Builds the prompt sent to the model.
 *
 * Exported for testing: the sentence section used to assert « ferme » from a nullable
 * boolean, and the model copied that qualifier into the prose it wrote, so a false claim
 * reached the published page through the context (#576).
 */
export function buildUserMessage(input: DescriptionEnrichmentInput): string {
  const sections: string[] = [];

  // Affair data
  sections.push(`AFFAIRE : ${input.title}`);
  sections.push(`Description actuelle : ${input.description}`);
  sections.push(`Statut judiciaire : ${input.status}`);
  sections.push(`Catégorie : ${input.category}`);
  sections.push(`Implication : ${input.involvement}`);
  if (input.factsDate) sections.push(`Date des faits : ${input.factsDate}`);
  if (input.verdictDate) sections.push(`Date du verdict : ${input.verdictDate}`);
  if (input.court) sections.push(`Juridiction : ${input.court}`);

  // Sentence details
  const sentenceParts: string[] = [];
  if (input.prisonMonths) {
    // No default qualifier: an unestablished split says « 48 mois de prison », full stop.
    const split = classifySentenceSplit(input.prisonMonths, input.prisonFirmMonths);
    const suffix =
      split.kind === "FULLY_SUSPENDED"
        ? " avec sursis"
        : split.kind === "FULLY_FIRM"
          ? " ferme"
          : split.kind === "MIXED"
            ? ` dont ${split.suspendedMonths} mois avec sursis`
            : "";
    sentenceParts.push(`${input.prisonMonths} mois de prison${suffix}`);
  }
  if (input.fineAmount) sentenceParts.push(`${input.fineAmount}€ d'amende`);
  if (input.ineligibilityMonths) {
    const split = classifySentenceSplit(input.ineligibilityMonths, input.ineligibilityFirmMonths);
    const suffix =
      split.kind === "FULLY_SUSPENDED"
        ? " avec sursis"
        : split.kind === "MIXED"
          ? ` dont ${split.suspendedMonths} mois avec sursis`
          : "";
    sentenceParts.push(`${input.ineligibilityMonths} mois d'inéligibilité${suffix}`);
  }
  if (input.communityService) sentenceParts.push(`${input.communityService}h de TIG`);
  if (input.otherSentence) sentenceParts.push(input.otherSentence);
  if (input.sentence && sentenceParts.length === 0) sentenceParts.push(input.sentence);
  if (sentenceParts.length > 0) sections.push(`Peine : ${sentenceParts.join(", ")}`);

  // Politician data
  sections.push("");
  sections.push(`POLITICIEN : ${input.politicianFullName}`);
  sections.push(`Slug : /politiques/${input.politicianSlug}`);
  if (input.politicianCivility) sections.push(`Civilité : ${input.politicianCivility}`);
  if (input.currentMandates.length > 0) {
    sections.push(`Mandats actuels : ${input.currentMandates.join(", ")}`);
  }

  // Party data
  if (input.partyAtTimeName) {
    sections.push(
      `Parti à l'époque des faits : ${input.partyAtTimeName} (slug: /partis/${input.partyAtTimeSlug})`
    );
  }
  if (input.currentPartyName && input.currentPartyName !== input.partyAtTimeName) {
    sections.push(
      `Parti actuel : ${input.currentPartyName} (slug: /partis/${input.currentPartySlug})`
    );
  }

  // Cross-linking data
  if (input.otherAffairs.length > 0) {
    sections.push("");
    sections.push("AUTRES AFFAIRES DU MÊME POLITICIEN :");
    for (const affair of input.otherAffairs) {
      sections.push(`- ${affair.title} (slug: /affaires/${affair.slug})`);
    }
  }

  return sections.join("\n");
}

function buildValidSlugs(input: DescriptionEnrichmentInput): Set<string> {
  const slugs = new Set<string>();
  slugs.add(input.politicianSlug);
  if (input.partyAtTimeSlug) slugs.add(input.partyAtTimeSlug);
  if (input.currentPartySlug) slugs.add(input.currentPartySlug);
  for (const affair of input.otherAffairs) {
    slugs.add(affair.slug);
  }
  return slugs;
}

/**
 * Validate that all markdown links point to provided slugs only.
 * Strip any invented links, keeping the text.
 */
function validateLinks(description: string, validSlugs: Set<string>): string {
  return description.replace(
    /\[([^\]]+)\]\(\/(politiques|partis|affaires)\/([^)]+)\)/g,
    (match, text, _type, slug) => {
      if (validSlugs.has(slug)) return match;
      return text; // Strip the link, keep the text
    }
  );
}
