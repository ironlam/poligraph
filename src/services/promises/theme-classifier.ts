import type { ThemeCategory } from "@/types";
import { THEME_RULES } from "./rules";
import { callAnthropic, parseAnthropicJSON } from "@/lib/api/anthropic";
import {
  isPresidentialTheme,
  THEMES_IN_ORDER,
  type PresidentialThemeCategory,
} from "@/lib/presidentielle/themes";

export interface ClassificationResult {
  theme: ThemeCategory;
  confidence: number;
  method: "rules" | "haiku";
}

const RULES_MIN_SCORE = 2;
const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const FALLBACK_THEME: ThemeCategory = "INSTITUTIONS";
const FALLBACK_CONFIDENCE = 0.1;

const VALID_THEMES: ReadonlySet<string> = new Set(THEME_RULES.map((r) => r.theme));

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchesKeyword(haystack: string, kw: string): boolean {
  if (kw.includes(" ")) return haystack.includes(kw);
  // Single-word: enforce word boundaries via Unicode letter/digit lookarounds.
  // Apostrophes are intentionally excluded from the word-class so French
  // elision (l'impôt, d'écologie) still matches the lemma.
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(kw)}(?![\\p{L}\\p{N}])`, "u");
  return re.test(haystack);
}

export function classifyByRules(text: string): ClassificationResult | null {
  // Note: no accent normalization. Keywords and input texts both carry accents
  // (press articles are properly accented). Q4 prototype scope.
  const lower = text.toLowerCase();
  const scores = new Map<ThemeCategory, number>();
  for (const rule of THEME_RULES) {
    for (const kw of rule.keywords) {
      if (matchesKeyword(lower, kw)) {
        scores.set(rule.theme, (scores.get(rule.theme) ?? 0) + rule.weight);
      }
    }
  }
  if (scores.size === 0) return null;
  const sorted = Array.from(scores.entries()).sort((a, b) => b[1] - a[1]);
  const [topTheme, topScore] = sorted[0]!;
  if (topScore < RULES_MIN_SCORE) return null;
  const secondScore = sorted[1]?.[1] ?? 0;
  const confidence = Math.min(0.95, 0.5 + (topScore - secondScore) * 0.1);
  return { theme: topTheme, confidence, method: "rules" };
}

const HAIKU_PROMPT = `Tu classes une déclaration politique française dans une des 13 catégories suivantes :
ECONOMIE_BUDGET, SOCIAL_TRAVAIL, SECURITE_JUSTICE, ENVIRONNEMENT_ENERGIE, SANTE,
EDUCATION_CULTURE, INSTITUTIONS, AFFAIRES_ETRANGERES_DEFENSE, NUMERIQUE_TECH,
IMMIGRATION, AGRICULTURE_ALIMENTATION, LOGEMENT_URBANISME, TRANSPORTS

Réponds STRICTEMENT au format JSON : {"theme": "<CATEGORIE>", "confidence": <0-1>}
Aucun texte hors JSON.

Déclaration à classer :
<text>{{TEXT}}</text>`;

const PRESIDENTIAL_HAIKU_PROMPT = `Tu classes une mesure de programme présidentiel français dans une des catégories suivantes :
${THEMES_IN_ORDER.join(", ")}

Pour les politiques auparavant regroupées sous SOCIAL_TRAVAIL, distingue impérativement :
- EMPLOI_TRAVAIL : emploi, salaires, droit du travail, chômage, formation professionnelle ;
- RETRAITES : âge de départ, pensions, cotisations et régimes de retraite ;
- SOLIDARITES_PROTECTION_SOCIALE : prestations, pauvreté, handicap, autonomie et protection sociale ;
- SOCIETE_DROITS_LIBERTES : égalité, discriminations, famille, bioéthique, droits et libertés.

SOCIAL_TRAVAIL n'est pas une valeur autorisée.
Réponds STRICTEMENT au format JSON : {"theme": "<CATEGORIE>", "confidence": <0-1>}
Aucun texte hors JSON.

Mesure à classer :
<text>{{TEXT}}</text>`;

async function classifyWithPrompt(
  text: string,
  promptTemplate: string
): Promise<{ theme?: string; confidence?: number } | null> {
  const safe = text
    .replace(/[<>]/g, " ")
    .replace(/["\n\r]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
  const prompt = promptTemplate.replace("{{TEXT}}", safe);
  try {
    const response = await callAnthropic([{ role: "user", content: prompt }], {
      model: HAIKU_MODEL,
      maxTokens: 100,
    });
    const textBlock = response.content.find((c) => c.type === "text" && typeof c.text === "string");
    const raw = textBlock?.text ?? "";
    try {
      return parseAnthropicJSON<{ theme?: string; confidence?: number }>(raw);
    } catch {
      return null;
    }
  } catch (err) {
    console.error(
      "[promises/theme-classifier] Haiku call failed:",
      err instanceof Error ? err.message : String(err)
    );
    return null;
  }
}

export async function classifyByHaiku(text: string): Promise<ClassificationResult | null> {
  const parsed = await classifyWithPrompt(text, HAIKU_PROMPT);
  if (parsed !== null) {
    if (!parsed.theme) return null;
    if (!VALID_THEMES.has(parsed.theme)) return null;
    const confidence = typeof parsed.confidence === "number" ? parsed.confidence : 0.5;
    return {
      theme: parsed.theme as ThemeCategory,
      confidence: Math.min(1, Math.max(0, confidence)),
      method: "haiku",
    };
  }
  return null;
}

export type PresidentialClassificationResult = Omit<ClassificationResult, "theme"> & {
  theme: PresidentialThemeCategory;
};

/** The presidential split cannot be recovered from the historical SOCIAL_TRAVAIL classifier. */
export async function classifyPresidentialTheme(
  text: string
): Promise<PresidentialClassificationResult | null> {
  const parsed = await classifyWithPrompt(text, PRESIDENTIAL_HAIKU_PROMPT);
  if (!parsed?.theme || !isPresidentialTheme(parsed.theme)) return null;
  const confidence = typeof parsed.confidence === "number" ? parsed.confidence : 0.5;
  return {
    theme: parsed.theme,
    confidence: Math.min(1, Math.max(0, confidence)),
    method: "haiku",
  };
}

export async function classifyTheme(text: string): Promise<ClassificationResult> {
  const rules = classifyByRules(text);
  if (rules && rules.confidence >= 0.7) return rules;
  const haiku = await classifyByHaiku(text);
  if (haiku) return haiku;
  return rules ?? { theme: FALLBACK_THEME, confidence: FALLBACK_CONFIDENCE, method: "rules" };
}
