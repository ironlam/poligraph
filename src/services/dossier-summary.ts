/**
 * AI generation of structured summaries for legislative dossiers.
 *
 * Uses Mistral to generate 3-5 bullet-point summaries explaining
 * what the dossier proposes, in plain French for citizens.
 */

import { callMistral, extractMistralText, parseMistralJSON } from "@/lib/api/mistral";

const MISTRAL_MODEL = "mistral-large-latest";
const MAX_TOKENS = 1500;

// ============================================
// TYPES
// ============================================

export interface DossierSummaryInput {
  title: string;
  shortTitle: string | null;
  number: string | null;
  category: string | null;
  status: string;
  filingDate: string | null;
  /** Exposé des motifs (full text from AN) */
  exposeDesMotifs: string | null;
  /** Structured timeline of legislative acts */
  timelineLabels: string[];
  /** Authors and their roles */
  authors: string[];
  /** Linked scrutin titles for context */
  scrutinTitles: string[];
  /** Number of amendments */
  amendmentCount: number;
}

export interface DossierSummaryOutput {
  summary: string;
  confidence: number;
}

// ============================================
// PROMPT
// ============================================

const SYSTEM_PROMPT = `Tu es un rédacteur factuel pour Poligraph, un observatoire citoyen de la politique française.

MISSION : Résumer un dossier législatif en 3 à 5 points clés, compréhensibles par un citoyen sans connaissance juridique.

FORMAT OBLIGATOIRE :
- Chaque point commence par "- " (tiret + espace)
- Chaque point fait 1-2 phrases maximum
- Le premier point décrit CE QUE le texte propose concrètement
- Les points suivants couvrent : le contexte et les acteurs concernés
- JAMAIS l'état d'avancement (déposé, en attente d'examen, examiné, adopté, rejeté) : il change après la génération du résumé et la page l'affiche déjà à part
- Pas de titre, pas de numérotation, pas de markdown enrichi : uniquement des tirets

NEUTRALITÉ - RÈGLES :
1. JAMAIS de jugement de valeur : pas de "ambitieux", "important", "nécessaire", "dangereux"
2. Décrire factuellement ce que le texte propose, pas ce qu'il "vise à améliorer"
3. Préférer "propose de" à "vise à renforcer" (ce dernier est un jugement positif)
4. JAMAIS briser le 4e mur ("les informations disponibles", "selon le texte")
5. Traduire TOUT le jargon parlementaire en français courant
6. Ne PAS inventer de mesures concrètes absentes des données fournies
7. Si les données sont trop minces, confidence < 40

STYLE :
- Français courant, phrases courtes
- Pas de chiffres inventés
- Ne PAS répéter le titre du dossier dans le résumé

RÉPONSE : JSON avec exactement deux champs :
- "summary" : le résumé en UNE SEULE chaîne de caractères, avec les points séparés par des retours à la ligne (\\n). Exemple : "- Point 1\\n- Point 2\\n- Point 3"
- "confidence" : entier 0-100 (80+ = données riches, 40-79 = titre seul mais clair, <40 = trop vague)`;

// ============================================
// MAIN FUNCTION
// ============================================

export async function generateDossierSummary(
  input: DossierSummaryInput
): Promise<DossierSummaryOutput> {
  const userMessage = buildUserMessage(input);

  const response = await callMistral([{ role: "user", content: userMessage }], {
    model: MISTRAL_MODEL,
    maxTokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    temperature: 0.3,
    responseFormat: { type: "json_object" },
  });

  const text = extractMistralText(response);

  try {
    const parsed = parseMistralJSON<{ summary: string | string[]; confidence: number }>(text);
    // Mistral sometimes returns summary as array of strings instead of single string
    const summary = Array.isArray(parsed.summary)
      ? parsed.summary.join("\n")
      : (parsed.summary ?? "");
    return {
      summary: summary.trim(),
      confidence: parsed.confidence ?? 0,
    };
  } catch {
    return { summary: "", confidence: 0 };
  }
}

// ============================================
// HELPERS
// ============================================

function buildUserMessage(input: DossierSummaryInput): string {
  const sections: string[] = [];

  sections.push(`DOSSIER : ${input.title}`);
  if (input.shortTitle && input.shortTitle !== input.title) {
    sections.push(`Titre court : ${input.shortTitle}`);
  }
  if (input.number) sections.push(`Numéro : ${input.number}`);
  if (input.category) sections.push(`Catégorie : ${input.category}`);
  sections.push(`Statut : ${input.status}`);
  if (input.filingDate) sections.push(`Date de dépôt : ${input.filingDate}`);

  if (input.authors.length > 0) {
    sections.push("");
    sections.push("AUTEURS :");
    sections.push(input.authors.join(", "));
  }

  if (input.exposeDesMotifs) {
    sections.push("");
    sections.push("EXPOSÉ DES MOTIFS :");
    // Truncate to avoid token overflow
    sections.push(input.exposeDesMotifs.slice(0, 4000));
  }

  if (input.timelineLabels.length > 0) {
    sections.push("");
    sections.push("PARCOURS LÉGISLATIF :");
    sections.push(input.timelineLabels.join(" > "));
  }

  if (input.scrutinTitles.length > 0) {
    sections.push("");
    sections.push("VOTES LIÉS :");
    for (const t of input.scrutinTitles.slice(0, 5)) {
      sections.push(`- ${t}`);
    }
  }

  if (input.amendmentCount > 0) {
    sections.push("");
    sections.push(`AMENDEMENTS : ${input.amendmentCount} déposés`);
  }

  return sections.join("\n");
}
