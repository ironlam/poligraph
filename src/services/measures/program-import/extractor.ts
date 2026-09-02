import { callMistral, extractMistralText, parseMistralJSON } from "@/lib/api/mistral";
import { THEMES_IN_ORDER } from "@/lib/presidentielle/themes";
import { isHistoricalStatement } from "./policy";
import { extractionSchema, type DocumentSegment, type ExtractedProposal } from "./types";

export const EXTRACTOR_VERSION = "mistral-large-latest/presidential-program-import-5";

export type ExtractorRetryEvent = {
  attempt: number;
  maxAttempts: number;
  delayMs: number;
};

export type ExtractSegmentOptions = {
  onRetry?: (event: ExtractorRetryEvent) => void;
  documentContext?: {
    documentType: string;
    documentLabel: string;
  };
};

export const EXTRACTION_SYSTEM_PROMPT = `Tu extrais des propositions politiques sans interprétation.
Ton travail consiste à recenser les extraits politiquement significatifs et à reconnaître les engagements présents dans le texte, pas à reconstituer le programme que l'auteur aurait pu vouloir écrire.

Contrat de classification :
- MEASURE : action explicitement proposée. Une action reste une mesure sans budget, calendrier, montant, indicateur ou détail d'implémentation. Créer, supprimer, conditionner, doubler, indexer, rendre portable, interdire, imposer ou instaurer peuvent constituer une mesure dès que l'action est explicitement attribuable au document.
- OBJECTIVE : résultat ou cible recherchée, sans action suffisamment identifiable pour dire comment ce résultat sera poursuivi.
- GENERAL_INTENT : orientation politique ou volonté générale sans action suffisamment définie.
- DIAGNOSIS : constat, description d'une situation ou d'une décision passée.
- VALUE : principe, jugement normatif ou vision de société sans action autonome.
- AMBIGUOUS : la source elle-même ne permet pas de déterminer de manière fiable ce qui est proposé.

Ne classe pas AMBIGUOUS uniquement parce que la phrase est courte, vient d'une liste ou d'un titre programmatique, ou ne comporte ni modalités, ni échéance, ni somme. Ne promeus pas pour autant un slogan ou un verbe isolé : l'action et son objet doivent être identifiables dans la source.

Teste chaque proposition comme une unité autonome : peux-tu répondre, avec la seule citation sourceText, à « quelle action est annoncée, ou quel résultat est explicitement visé ? ». Un titre de section, un label politique, une formule nominale, une accroche commençant par « Pour... », un principe ou une métaphore ne suffit pas. Le heading situe la citation, mais ne transforme jamais le heading lui-même en engagement.

Une description au présent d'un dispositif existant reste DIAGNOSIS. Une action au passé ou une ancienne proposition reste DIAGNOSIS, même si son verbe est concret. Une proposition attribuée à un tiers reste DIAGNOSIS ou AMBIGUOUS tant que le document ne la reprend pas explicitement à son compte. Le discours rapporté, les citations et les verbes comme « propose », « avait proposé », « recommande » ou « selon » exigent donc une attribution explicite avant MEASURE ou OBJECTIVE.

Pour distinguer MEASURE et OBJECTIVE, cherche le moyen autonome dans la citation. « Réduire de moitié X » est OBJECTIVE si aucun moyen n'est annoncé. « Instaurer Y afin de réduire X » est MEASURE. Les verbes vagues comme agir, défendre, favoriser, assumer, sanctionner ou empêcher ne décrivent pas seuls un mécanisme : sans action plus déterminée, utilise OBJECTIVE, GENERAL_INTENT ou AMBIGUOUS selon ce que dit réellement la source.

Exemples de MEASURE :
- « Lutter contre les horaires atypiques en rémunérant double les heures avant 8 h et après 18 h. »
- « Nous voulons que les salariés sous-traitants puissent bénéficier des mêmes droits que les salariés de l'entreprise donneuse d'ordre. »
- « Créer la Haute Autorité à la probité, fusion de l'ensemble des organes existants de l'éthique de la vie publique. »
- « Supprimer l'actuelle convention judiciaire d'intérêt public (CJIP). »
- « Conditionner les aides publiques au tourisme à des engagements de modération tarifaire et d'accessibilité. »

Exemples de limites : « mieux payer celles et ceux qui prennent soin » est OBJECTIVE ; « remettre de la joie dans le quotidien » est GENERAL_INTENT ; « les vacances restent un marqueur d'inégalité » est DIAGNOSIS ; « mettre une entreprise au chômage » sans mécanisme identifiable est AMBIGUOUS. Un titre comme « pour un statut des travailleurs essentiels » nomme une cible mais pas une action, ce n'est pas une MEASURE. « Défendre le principe du broyeur-payeur » ou demander que des entreprises « paient au prix fort » reste une orientation tant que le mécanisme n'est pas donné. « Le chef de l'État fixe sa rémunération » décrit une règle existante, DIAGNOSIS. « Il faudrait prendre en compte l'amplitude horaire », isolé dans une citation de tiers, n'est pas attribuable au document.

Une décision passée ou une proposition de loi antérieure n'est pas une mesure actuelle. Une action future peut toutefois citer une année ou une décision passée sans devenir historique.

Le bloc contexte sert uniquement à comprendre la place de l'extrait. sourceText doit être une citation du seul bloc document-source. Le contexte ne peut fournir aucun chiffre, acteur, organisme, dispositif, date, seuil ou périmètre absent de cette citation.
Toute information absente de sourceText doit rester absente de normalizedText. Pour éviter toute invention, conserve les mots précis de la citation et transforme seulement la grammaire si nécessaire. Une normalisation identique à la citation est acceptable. Si aucune normalisation sûre n'est possible, renvoie null.

N'omets pas une valeur, un diagnostic ou une intention politiquement significative : conserve l'extrait avec sa classe non-action. L'acceptation éditoriale est décidée séparément.`;

const OUTPUT_FORMAT = `Réponds uniquement avec un objet JSON de cette forme :
{"proposals":[{"sourceText":"citation exacte","normalizedText":"formulation fidèle ou null","classification":"MEASURE|OBJECTIVE|VALUE|DIAGNOSIS|GENERAL_INTENT|AMBIGUOUS","theme":"une valeur ThemeCategory ou null","confidence":0.0,"rationale":"raison courte"}]}
Les seules valeurs de thème sont ${THEMES_IN_ORDER.join(", ")}.`;

function sanitizePromptContext(value: string, maxLength: number): string {
  return value.replace(/["\n\r]/g, " ").slice(0, maxLength);
}

const GRAMMATICAL_TOKENS = new Set([
  "a",
  "afin",
  "au",
  "aux",
  "avec",
  "ce",
  "ces",
  "cette",
  "ceux",
  "celles",
  "comme",
  "dans",
  "de",
  "des",
  "du",
  "elle",
  "en",
  "et",
  "il",
  "la",
  "le",
  "les",
  "leur",
  "leurs",
  "lui",
  "ne",
  "ni",
  "notre",
  "nous",
  "par",
  "pas",
  "plus",
  "pour",
  "que",
  "qui",
  "sa",
  "sans",
  "sera",
  "ses",
  "son",
  "sur",
  "tous",
  "tout",
  "toutes",
  "un",
  "une",
  "vers",
  "y",
  // Purely grammatical completion of an already named time or action.
  "effectu",
]);

export type NormalizationGroundingFailure = NonNullable<ExtractedProposal["normalizationFallback"]>;

function wordTokens(text: string): string[] {
  return (
    text
      .normalize("NFKD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .match(/[a-z0-9]+/g) ?? []
  );
}

function numberTokens(text: string): Set<string> {
  const matches = normalizeForGrounding(text).match(/\d+(?:[ \u00a0\u202f]\d{3})*(?:[,.]\d+)?/g);
  return new Set(
    (matches ?? []).map((value) => value.replace(/[ \u00a0\u202f]/g, "").replace(",", "."))
  );
}

function canonicalContentToken(token: string): string {
  let value = token;
  for (const suffix of [
    "erons",
    "eront",
    "erez",
    "drons",
    "aient",
    "ions",
    "ons",
    "ant",
    "ees",
    "ee",
    "es",
    "e",
    "er",
    "ir",
  ]) {
    if (value.length > suffix.length + 3 && value.endsWith(suffix)) {
      value = value.slice(0, -suffix.length);
      break;
    }
  }
  if (value.length > 3 && /[sx]$/.test(value)) value = value.slice(0, -1);
  if (/^(augment|revaloris|hauss|port)$/.test(value)) return "increase";
  if (/^econom/.test(value)) return "savings";
  if (/^(cre|instaur|etabl)$/.test(value)) return "create";
  if (/^(garant|assur|benefici)$/.test(value)) return "guarantee";
  if (/^(supprim|abol|retir)$/.test(value)) return "remove";
  if (/^fusion/.test(value)) return "merge";
  if (/^pren(d?r)?$/.test(value)) return "take";
  return value;
}

function contentTokens(text: string): Set<string> {
  return new Set(
    wordTokens(text)
      .filter((token) => !GRAMMATICAL_TOKENS.has(token))
      .map(canonicalContentToken)
      .filter((token) => !GRAMMATICAL_TOKENS.has(token) && !/^\d+$/.test(token))
  );
}

function properNameTokens(text: string): Set<string> {
  const names = new Set<string>();
  for (const match of text.matchAll(/\p{L}[\p{L}'’.-]*/gu)) {
    const value = match[0];
    const letters = value.replace(/[^\p{L}]/gu, "");
    const startsSentence =
      match.index === 0 || /[.!?]\s*$/.test(text.slice(0, match.index).trimEnd());
    const acronym = letters.length >= 2 && letters === letters.toLocaleUpperCase("fr");
    const titleCase = /^\p{Lu}\p{Ll}{2,}/u.test(letters) && !startsSentence;
    if (acronym || titleCase) names.add(normalizeForGrounding(value));
  }
  return names;
}

function hasPercentage(text: string): boolean {
  return /%|\bpour\s+cent\b/i.test(text);
}

function hasCurrency(text: string): boolean {
  return /€|\beuros?\b/i.test(text);
}

export function normalizeForGrounding(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/(\p{L})-\s+(\p{L})/gu, "$1$2")
    .replace(/[‘’‛`´]/g, "'")
    .replace(/[«»“”„]/g, '"')
    .replace(/[‐‑‒–—―]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("fr");
}

export function sourceTextIsGrounded(documentText: string, sourceText: string): boolean {
  const normalizedSource = normalizeForGrounding(sourceText);
  if (normalizedSource.length < 10) return false;
  const normalizedDocument = normalizeForGrounding(documentText);
  if (normalizedDocument.includes(normalizedSource)) return true;

  // PDF columns can interleave unrelated text between two parts of a citation. Accept only
  // an exact ordered token subsequence in a bounded window. No missing source token, number
  // or name is tolerated.
  const sourceTokens = wordTokens(normalizedSource);
  const documentTokens = wordTokens(normalizedDocument);
  if (sourceTokens.length < 3) return false;
  for (const [firstMatch, token] of documentTokens.entries()) {
    if (token !== sourceTokens[0]) continue;
    let sourceIndex = 1;
    let lastMatch = firstMatch;
    for (
      let documentIndex = firstMatch + 1;
      documentIndex < documentTokens.length;
      documentIndex += 1
    ) {
      if (documentTokens[documentIndex] !== sourceTokens[sourceIndex]) continue;
      lastMatch = documentIndex;
      sourceIndex += 1;
      if (sourceIndex === sourceTokens.length) break;
    }
    if (sourceIndex !== sourceTokens.length) continue;
    const span = lastMatch - firstMatch + 1;
    if (span <= sourceTokens.length * 4 + 20) return true;
  }
  return false;
}

export function getGroundedCitationContext(documentText: string, sourceText: string): string {
  const originalDocument = documentText.toLocaleLowerCase("fr");
  const originalSource = sourceText.toLocaleLowerCase("fr");
  const originalIndex = originalDocument.indexOf(originalSource);
  if (originalIndex !== -1) {
    return documentText.slice(
      Math.max(0, originalIndex - 160),
      Math.min(documentText.length, originalIndex + sourceText.length + 240)
    );
  }
  const normalizedDocument = normalizeForGrounding(documentText);
  const normalizedSource = normalizeForGrounding(sourceText);
  const sourceIndex = normalizedDocument.indexOf(normalizedSource);
  if (sourceIndex === -1) return sourceText;
  return normalizedDocument.slice(
    Math.max(0, sourceIndex - 160),
    Math.min(normalizedDocument.length, sourceIndex + normalizedSource.length + 240)
  );
}

/**
 * Deterministic grounding invariant for normalized text:
 * - every number, percentage, currency and proper name must exist in the citation;
 * - every remaining content token must exist in the citation after conservative stemming;
 * - only a short, explicit set of grammatical tokens and equivalent action verbs is tolerated.
 *
 * This allows faithful grammatical rewrites while failing closed on a new threshold, date,
 * named actor or precise policy device.
 */
export function getNormalizationGroundingFailure(
  source: string,
  normalized: string
): NormalizationGroundingFailure | null {
  const sourceNumbers = numberTokens(source);
  if ([...numberTokens(normalized)].some((number) => !sourceNumbers.has(number))) {
    return "NUMBER_ADDED";
  }
  if (hasPercentage(normalized) && !hasPercentage(source)) return "PERCENTAGE_ADDED";
  if (hasCurrency(normalized) && !hasCurrency(source)) return "CURRENCY_ADDED";

  const normalizedSource = normalizeForGrounding(source);
  if ([...properNameTokens(normalized)].some((name) => !normalizedSource.includes(name))) {
    return "PROPER_NAME_ADDED";
  }

  const sourceContent = contentTokens(source);
  if ([...contentTokens(normalized)].some((token) => !sourceContent.has(token))) {
    return "PRECISE_CONTENT_ADDED";
  }
  return null;
}

export function normalizedTextAddsInformation(source: string, normalized: string): boolean {
  return getNormalizationGroundingFailure(source, normalized) !== null;
}

function isRateLimitError(error: unknown): boolean {
  return error instanceof Error && /Mistral API error 429|rate limit/i.test(error.message);
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function callMistralWithRateLimitRetry(
  messages: Parameters<typeof callMistral>[0],
  options: Parameters<typeof callMistral>[1],
  onRetry?: (event: ExtractorRetryEvent) => void
) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await callMistral(messages, options);
    } catch (error) {
      lastError = error;
      if (!isRateLimitError(error) || attempt === 4) throw error;
      const delayMs = 2 ** attempt * 2_000;
      onRetry?.({ attempt: attempt + 2, maxAttempts: 5, delayMs });
      await wait(delayMs);
    }
  }
  throw lastError;
}

export async function extractSegment(
  segment: DocumentSegment,
  options: ExtractSegmentOptions = {}
): Promise<ExtractedProposal[]> {
  const sanitized = sanitizePromptContext(segment.text, 8_000);
  const heading = segment.heading ? sanitizePromptContext(segment.heading, 200) : "unknown";
  const documentType = options.documentContext
    ? sanitizePromptContext(options.documentContext.documentType, 100)
    : "unknown";
  const documentLabel = options.documentContext
    ? sanitizePromptContext(options.documentContext.documentLabel, 200)
    : "unknown";
  const context = `<context-only><document-type>${documentType}</document-type><document-label>${documentLabel}</document-label><heading>${heading}</heading><page>${segment.page ?? "unknown"}</page></context-only>`;
  const response = await callMistralWithRateLimitRetry(
    [
      {
        role: "user",
        content: `${OUTPUT_FORMAT}\n\n${context}\n<document-source>${sanitized}</document-source>`,
      },
    ],
    {
      system: EXTRACTION_SYSTEM_PROMPT,
      model: "mistral-large-latest",
      maxTokens: 3000,
      temperature: 0,
      responseFormat: { type: "json_object" },
    },
    options.onRetry
  );
  const parsed = extractionSchema.parse(parseMistralJSON<unknown>(extractMistralText(response)));
  return parsed.proposals.map((proposal) => {
    if (!sourceTextIsGrounded(segment.text, proposal.sourceText)) {
      return {
        ...proposal,
        normalizedText: null,
        classification: "AMBIGUOUS",
        rationale: "Citation introuvable dans le segment documentaire source.",
        extractionGuard: "UNGROUNDED_SOURCE_TEXT",
        page: segment.page,
      };
    }
    const historicalContext = isHistoricalStatement(
      getGroundedCitationContext(segment.text, proposal.sourceText)
    );
    if (
      proposal.normalizedText === null &&
      (proposal.classification === "MEASURE" || proposal.classification === "OBJECTIVE")
    ) {
      return {
        ...proposal,
        normalizedText: proposal.sourceText,
        rationale: "Normalisation exacte remplacée par la citation source grounded.",
        exactSourceFallback: true,
        historicalContext,
        page: segment.page,
      };
    }
    if (proposal.normalizedText) {
      const groundingFailure = getNormalizationGroundingFailure(
        proposal.sourceText,
        proposal.normalizedText
      );
      if (groundingFailure) {
        // The model made the positive classification. The deterministic layer never promotes
        // it. It only discards the unsafe rewrite and keeps the already grounded source quote,
        // which cannot add a number, actor, device, date, threshold or policy perimeter.
        return {
          ...proposal,
          normalizedText: proposal.sourceText,
          rationale: `Normalisation remplacée par la citation source: ${groundingFailure}.`,
          normalizationFallback: groundingFailure,
          exactSourceFallback: true,
          historicalContext,
          page: segment.page,
        };
      }
    }
    return { ...proposal, historicalContext, page: segment.page };
  });
}
