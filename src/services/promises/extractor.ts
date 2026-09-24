import { callAnthropic, parseAnthropicJSON } from "@/lib/api/anthropic";

export interface ExtractedPromise {
  text: string;
  context?: string;
  confidence: number;
}

const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const MIN_PROMISE_LENGTH = 10;
const MAX_PROMISE_LENGTH = 500;

const EXTRACTION_PROMPT = `Tu extrais d'un article de presse politique français les promesses ou engagements prospectifs faits par un politicien nommé.

Critères de qualification d'une promesse :
- Caractère prospectif (action future, intention)
- Sujet politique précis (loi, budget, mesure, réforme)
- Attribution claire au politicien nommé

NE PAS extraire :
- Critiques d'autres politiciens
- Constats sur le passé
- Phrases interrogatives ou rhétoriques

Réponds en JSON strict, sans texte hors du JSON, format :
{"promises": [{"text": "<verbatim ou paraphrase fidèle>", "context": "<phrase environnante>", "confidence": <0-1>}]}

Si aucune promesse, retourne {"promises": []}.

<politicien>{{POLITICIAN}}</politicien>
<article>{{TEXT}}</article>`;

/**
 * Strip what could close or open one of the prompt's XML delimiters.
 *
 * Exported so the guard can be asserted without calling the model.
 */
export function sanitizeForPrompt(text: string): string {
  // Two passes. The first drops whole tags, including the `</article >` and `<article id="x">`
  // forms the previous expression accepted neither a space nor an attribute for. The second
  // removes what is left over, since an unterminated `<` is enough to close the delimiter that
  // separates the article from the instructions.
  return text.replace(/<[^>]*>/g, "").replace(/[<>]/g, "");
}

export async function extractPromisesFromText(input: {
  text: string;
  politicianName: string;
}): Promise<ExtractedPromise[]> {
  const safeText = sanitizeForPrompt(input.text).slice(0, 4000);
  const safeName = input.politicianName.replace(/[<>]/g, "").slice(0, 100);
  const prompt = EXTRACTION_PROMPT.replace("{{POLITICIAN}}", safeName).replace(
    "{{TEXT}}",
    safeText
  );

  try {
    const response = await callAnthropic([{ role: "user", content: prompt }], {
      label: "promises-extractor",
      model: HAIKU_MODEL,
      maxTokens: 2000,
    });
    const textBlock = response.content.find((c) => c.type === "text" && typeof c.text === "string");
    const raw = textBlock?.text ?? "";
    let parsed: { promises?: ExtractedPromise[] };
    try {
      parsed = parseAnthropicJSON<{ promises?: ExtractedPromise[] }>(raw);
    } catch {
      return [];
    }
    if (!parsed || !Array.isArray(parsed.promises)) return [];
    return parsed.promises.filter(
      (p) =>
        typeof p.text === "string" &&
        p.text.length > MIN_PROMISE_LENGTH &&
        p.text.length < MAX_PROMISE_LENGTH
    );
  } catch (err) {
    console.error(
      "[promises/extractor] Haiku call failed:",
      err instanceof Error ? err.message : String(err)
    );
    return [];
  }
}
