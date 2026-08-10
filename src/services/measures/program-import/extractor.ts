import { callAnthropic, extractToolUse } from "@/lib/api/anthropic";
import { extractionSchema, type DocumentSegment, type ExtractedProposal } from "./types";

export const EXTRACTOR_VERSION = "presidential-program-import/1";

export const EXTRACTION_SYSTEM_PROMPT = `Tu extrais des propositions politiques sans interprétation.
Ton travail consiste à reconnaître les engagements présents dans le texte, pas à reconstituer le programme que l'auteur aurait pu vouloir écrire.
Rejette les valeurs, diagnostics, slogans, commentaires, critiques et intentions vagues.
Une proposition exploitable doit permettre de répondre à la question : « quelle action ou quelle cible est effectivement annoncée ? »
Toute information absente de la source doit rester absente de la formulation normalisée.
En cas de doute, classe AMBIGUOUS plutôt que MEASURE.
Exemples : « rendre du pouvoir d'achat » est GENERAL_INTENT ; « réduire la TVA sur l'électricité à 5,5 % » est MEASURE ; « retrouver notre souveraineté » est VALUE ; « organiser un référendum sur la primauté du droit national » est MEASURE.`;

const tool = {
  name: "classer_propositions",
  description: "Classe les propositions présentes, sans ajout d'information.",
  input_schema: {
    type: "object",
    properties: {
      proposals: {
        type: "array",
        items: {
          type: "object",
          properties: {
            sourceText: { type: "string" },
            normalizedText: { type: ["string", "null"] },
            classification: {
              type: "string",
              enum: ["MEASURE", "OBJECTIVE", "VALUE", "DIAGNOSIS", "GENERAL_INTENT", "AMBIGUOUS"],
            },
            theme: {
              type: ["string", "null"],
              enum: [
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
                null,
              ],
            },
            confidence: { type: "number", minimum: 0, maximum: 1 },
            rationale: { type: "string" },
          },
          required: [
            "sourceText",
            "normalizedText",
            "classification",
            "theme",
            "confidence",
            "rationale",
          ],
        },
      },
    },
    required: ["proposals"],
  },
};

function tokens(text: string): Set<string> {
  return new Set(
    text
      .normalize("NFKD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .match(/[a-z0-9€%]+/g) ?? []
  );
}

export function normalizedTextAddsInformation(source: string, normalized: string): boolean {
  const sourceTokens = tokens(source);
  return [...tokens(normalized)].some((token) => !sourceTokens.has(token));
}

export async function extractSegment(segment: DocumentSegment): Promise<ExtractedProposal[]> {
  const sanitized = segment.text.replace(/["\n\r]/g, " ").slice(0, 8_000);
  const response = await callAnthropic(
    [{ role: "user", content: `<document>${sanitized}</document>` }],
    {
      system: EXTRACTION_SYSTEM_PROMPT,
      tools: [tool],
      toolChoice: { type: "tool", name: tool.name },
      maxTokens: 3000,
    }
  );
  const parsed = extractionSchema.parse(extractToolUse(response));
  return parsed.proposals.map((proposal) => {
    if (
      proposal.normalizedText &&
      normalizedTextAddsInformation(proposal.sourceText, proposal.normalizedText)
    ) {
      return { ...proposal, normalizedText: null, classification: "AMBIGUOUS", page: segment.page };
    }
    return { ...proposal, page: segment.page };
  });
}
