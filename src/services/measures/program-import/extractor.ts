import { callMistral, extractMistralText, parseMistralJSON } from "@/lib/api/mistral";
import { extractionSchema, type DocumentSegment, type ExtractedProposal } from "./types";

export const EXTRACTOR_VERSION = "mistral-large-latest/presidential-program-import-2";

export const EXTRACTION_SYSTEM_PROMPT = `Tu extrais des propositions politiques sans interprétation.
Ton travail consiste à reconnaître les engagements présents dans le texte, pas à reconstituer le programme que l'auteur aurait pu vouloir écrire.
Rejette les valeurs, diagnostics, slogans, commentaires, critiques et intentions vagues.
Une proposition exploitable doit permettre de répondre à la question : « quelle action ou quelle cible est effectivement annoncée ? »
Toute information absente de la source doit rester absente de la formulation normalisée.
En cas de doute, classe AMBIGUOUS plutôt que MEASURE.
Exemples : « rendre du pouvoir d'achat » est GENERAL_INTENT ; « réduire la TVA sur l'électricité à 5,5 % » est MEASURE ; « retrouver notre souveraineté » est VALUE ; « organiser un référendum sur la primauté du droit national » est MEASURE.`;

const OUTPUT_FORMAT = `Réponds uniquement avec un objet JSON de cette forme :
{"proposals":[{"sourceText":"citation exacte","normalizedText":"formulation fidèle ou null","classification":"MEASURE|OBJECTIVE|VALUE|DIAGNOSIS|GENERAL_INTENT|AMBIGUOUS","theme":"une valeur ThemeCategory ou null","confidence":0.0,"rationale":"raison courte"}]}
Les seules valeurs de thème sont ECONOMIE_BUDGET, SOCIAL_TRAVAIL, SECURITE_JUSTICE, ENVIRONNEMENT_ENERGIE, SANTE, EDUCATION_CULTURE, INSTITUTIONS, AFFAIRES_ETRANGERES_DEFENSE, NUMERIQUE_TECH, IMMIGRATION, AGRICULTURE_ALIMENTATION, LOGEMENT_URBANISME et TRANSPORTS.`;

function tokens(text: string): Set<string> {
  return new Set(
    text
      .normalize("NFKD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .match(/[a-z0-9€%]+/g) ?? []
  );
}

export function normalizeForGrounding(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[‘’‛`´]/g, "'")
    .replace(/[«»“”„]/g, '"')
    .replace(/[‐‑‒–—―]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("fr");
}

export function sourceTextIsGrounded(documentText: string, sourceText: string): boolean {
  const normalizedSource = normalizeForGrounding(sourceText);
  return (
    normalizedSource.length >= 10 && normalizeForGrounding(documentText).includes(normalizedSource)
  );
}

export function normalizedTextAddsInformation(source: string, normalized: string): boolean {
  const sourceTokens = tokens(source);
  return [...tokens(normalized)].some((token) => !sourceTokens.has(token));
}

function isRateLimitError(error: unknown): boolean {
  return error instanceof Error && /Mistral API error 429|rate limit/i.test(error.message);
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function callMistralWithRateLimitRetry(
  messages: Parameters<typeof callMistral>[0],
  options: Parameters<typeof callMistral>[1]
) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await callMistral(messages, options);
    } catch (error) {
      lastError = error;
      if (!isRateLimitError(error) || attempt === 4) throw error;
      await wait(2 ** attempt * 2_000);
    }
  }
  throw lastError;
}

export async function extractSegment(segment: DocumentSegment): Promise<ExtractedProposal[]> {
  const sanitized = segment.text.replace(/["\n\r]/g, " ").slice(0, 8_000);
  const response = await callMistralWithRateLimitRetry(
    [{ role: "user", content: `${OUTPUT_FORMAT}\n\n<document>${sanitized}</document>` }],
    {
      system: EXTRACTION_SYSTEM_PROMPT,
      model: "mistral-large-latest",
      maxTokens: 3000,
      temperature: 0,
      responseFormat: { type: "json_object" },
    }
  );
  const parsed = extractionSchema.parse(parseMistralJSON<unknown>(extractMistralText(response)));
  return parsed.proposals.map((proposal) => {
    if (!sourceTextIsGrounded(segment.text, proposal.sourceText)) {
      return {
        ...proposal,
        normalizedText: null,
        classification: "AMBIGUOUS",
        rationale: "Citation introuvable dans le segment documentaire source.",
        page: segment.page,
      };
    }
    if (
      proposal.normalizedText &&
      normalizedTextAddsInformation(proposal.sourceText, proposal.normalizedText)
    ) {
      return { ...proposal, normalizedText: null, classification: "AMBIGUOUS", page: segment.page };
    }
    return { ...proposal, page: segment.page };
  });
}
