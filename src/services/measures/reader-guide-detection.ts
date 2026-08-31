import { callMistral, extractMistralText, parseMistralJSON } from "@/lib/api/mistral";
import {
  parseReaderGuideDetections,
  sanitizeReaderGuideDetectionText,
  type ReaderGuideDetection,
} from "@/lib/measures/reader-guide-detection";

const MODEL = "mistral-small-latest";

export async function detectReaderGuideTerms(input: {
  text: string;
  details: string | null;
  knownLabels: string[];
}): Promise<ReaderGuideDetection[]> {
  const text = sanitizeReaderGuideDetectionText(input.text, 4_000);
  const details = sanitizeReaderGuideDetectionText(input.details ?? "", 4_000);
  const vocabulary = input.knownLabels
    .slice(0, 200)
    .map((label) => sanitizeReaderGuideDetectionText(label, 120))
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
  return parseReaderGuideDetections(parsed.detections ?? [], `${text} ${details}`);
}
