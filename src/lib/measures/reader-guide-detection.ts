import { callMistral, extractMistralText, parseMistralJSON } from "@/lib/api/mistral";

export const READER_GUIDE_DETECTOR_VERSION = "mistral-small-latest:reader-guides-v1";
const MODEL = "mistral-small-latest";

export type ReaderGuideDetection = {
  term: string;
  canonicalLabel: string;
  evidenceSpan: string;
  needsExplanation: true;
  reason: string;
  confidence: number;
};

function sanitize(value: string, maxLength: number): string {
  return value
    .replace(/["\n\r<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function normalizeReaderGuideTerm(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function parseDetection(value: unknown): ReaderGuideDetection | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (
    typeof item.term !== "string" ||
    typeof item.canonicalLabel !== "string" ||
    typeof item.evidenceSpan !== "string" ||
    item.needsExplanation !== true ||
    typeof item.reason !== "string" ||
    typeof item.confidence !== "number"
  ) {
    return null;
  }
  const confidence = Math.max(0, Math.min(1, item.confidence));
  const term = sanitize(item.term, 120);
  const canonicalLabel = sanitize(item.canonicalLabel, 120);
  const evidenceSpan = sanitize(item.evidenceSpan, 240);
  const reason = sanitize(item.reason, 300);
  if (!term || !canonicalLabel || !evidenceSpan || !reason) return null;
  return { term, canonicalLabel, evidenceSpan, needsExplanation: true, reason, confidence };
}

export async function detectReaderGuideTerms(input: {
  text: string;
  details: string | null;
  knownLabels: string[];
}): Promise<ReaderGuideDetection[]> {
  const text = sanitize(input.text, 4_000);
  const details = sanitize(input.details ?? "", 4_000);
  const vocabulary = input.knownLabels
    .slice(0, 200)
    .map((label) => sanitize(label, 120))
    .join(" | ");
  const prompt = `Tu aides une rédaction civique à repérer les termes qu'un citoyen non spécialiste doit comprendre avant de lire une mesure politique.

Retourne uniquement un objet JSON {"detections": [...]} avec au maximum 5 éléments. Chaque élément contient term, canonicalLabel, evidenceSpan, needsExplanation=true, reason et confidence entre 0 et 1.

Retenir : sigles, mécanismes juridiques ou administratifs, dispositifs nommés, institutions peu connues, mots courants employés dans un sens technique, références réglementaires nécessaires à la compréhension.
Exemples de forme à examiner : ZFE, kafala judiciaire, quotient familial, obligation de quitter le territoire français. Ces exemples illustrent un niveau de technicité et ne doivent être retournés que s'ils figurent réellement dans la mesure.
Exclure : vocabulaire quotidien, noms de personnes, jugements politiques, concepts déjà expliqués dans le contexte, termes dont une définition n'apporterait rien. Ne complète jamais la mesure et ne rédige aucune définition.

<vocabulaire-connu>${vocabulary || "aucun"}</vocabulaire-connu>
<mesure>${text}</mesure>
<contexte>${details || "aucun"}</contexte>`;
  const response = await callMistral([{ role: "user", content: prompt }], {
    model: MODEL,
    temperature: 0,
    maxTokens: 1_000,
    responseFormat: { type: "json_object" },
  });
  const parsed = parseMistralJSON<{ detections?: unknown[] }>(extractMistralText(response));
  const seen = new Set<string>();
  const evidenceCorpus = `${text} ${details}`.toLowerCase();
  return (parsed.detections ?? []).flatMap((value) => {
    const detection = parseDetection(value);
    if (!detection || !evidenceCorpus.includes(detection.evidenceSpan.toLowerCase())) return [];
    const normalized = normalizeReaderGuideTerm(detection.term);
    if (!normalized || seen.has(normalized)) return [];
    seen.add(normalized);
    return [detection];
  });
}
