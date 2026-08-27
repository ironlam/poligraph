/**
 * AI generation of citizen-facing impact explanations for parliamentary votes.
 *
 * Uses Mistral (French-optimized) to generate "Ce que ca change pour vous"
 * explanations that translate procedural parliamentary language into
 * structured, scannable plain French for citizens.
 */

import { callMistral, extractMistralText, parseMistralJSON } from "@/lib/api/mistral";
import { escapeXmlText } from "@/lib/text/escape-xml";
import type { SubstanceTextBlock, SubstanceDepth } from "@/services/scrutin-policy-title/types";

const MISTRAL_MODEL = "mistral-large-latest";
const MAX_TOKENS = 2000;

// ============================================
// TYPES
// ============================================

export interface CitizenImpactInput {
  title: string;
  summary: string | null;
  theme: string | null;
  result: "ADOPTED" | "REJECTED";
  votesFor: number;
  votesAgainst: number;
  votesAbstain: number;
  chamber: "AN" | "SENAT";
  votingDate: string;
  dossierTitle: string | null;
  dossierSummary: string | null;
  sourcePageText: string | null;
  /**
   * OFFICIAL substance blocks from `resolveSubstanceSources` (amendment-first).
   * When non-empty, they are the SOLE basis for describing the voted measure;
   * `summary` / `dossierSummary` become background context only. Empty for
   * scrutins with no usable amendment text (whole-text votes, motions).
   */
  substanceBlocks: SubstanceTextBlock[];
  substanceDepth: SubstanceDepth | null;
  hasLinkedAmendment: boolean;
  links: {
    dossierUrl: string | null;
    dossierLabel: string | null;
    relatedVotes: { url: string; label: string }[];
    politicians: { url: string; label: string; position: string }[];
  };
}

export interface CitizenImpactOutput {
  citizenImpact: string;
  confidence: number;
}

// ============================================
// PROMPT
// ============================================

export const SYSTEM_PROMPT = `Tu es un rédacteur factuel pour Poligraph, un observatoire citoyen de la politique française.

MISSION : Expliquer factuellement ce que ce vote parlementaire change, ce que la mesure proposait, et pourquoi elle a été adoptée ou rejetée - en restant STRICTEMENT neutre. Le lecteur n'a AUCUNE connaissance juridique ou parlementaire préalable.

FORMAT OBLIGATOIRE - Utiliser du markdown structuré :
- Paragraphes courts (2-3 phrases max par paragraphe)
- Sous-titres en **gras** pour chaque section (pas de titres markdown #)
- Listes à puces pour les arguments du débat
- Utiliser le **gras** pour la mesure concrète votée
- Français courant
- Utiliser des liens markdown vers les pages Poligraph quand des LIENS DISPONIBLES sont fournis

QUI EST LE LECTEUR - RÈGLE ABSOLUE :
Le lecteur est un CITOYEN qui consulte le compte rendu d'un vote DÉJÀ TENU par des parlementaires. Il n'y a pris AUCUNE part : il ne vote pas, il n'a pas voté, il n'assiste pas à la séance, il n'a rien à décider ni à trancher.
- Le vote est un fait PASSÉ accompli par les députés (ou les sénateurs). En parler à la 3e personne et au passé : "les députés ont voté sur...", "l'Assemblée nationale a examiné...", "le Sénat a rejeté...".
- N'employer "vous" QUE pour décrire les conséquences concrètes de la décision sur la vie du lecteur ("ce que cela change pour vous", "si vous louez votre logement, ..."). JAMAIS pour lui prêter un rôle dans la procédure parlementaire.
- FORMULATIONS INTERDITES, ainsi que toutes leurs variantes : "Vous votez sur...", "Vous avez voté...", "Vous allez voter...", "Vous devez vous prononcer...", "Votre vote...", "Vous assistez à un vote...", "Vous êtes appelé à...", "Vous participez à...".

STRUCTURE A SUIVRE :

**De quoi s'agit-il ?**
1-2 phrases pour poser le contexte : quelle loi, quel sujet de société. Le sujet de la phrase est le TEXTE, la loi ou les parlementaires - jamais le lecteur : "Les députés ont examiné une loi d'urgence destinée à...", "Ce texte porte sur...". Ne JAMAIS écrire "l'article 21" sans expliquer en langage courant ce que cet article traite.

**Ce qui était proposé**
1-2 phrases sur ce que la mesure/l'amendement proposait concrètement. Mettre en **gras** la mesure clé.

**Le résultat du vote**
1 phrase sur le résultat et ce que cela implique.

**Le débat**
- **Pour :** 1-2 phrases sur les arguments des partisans
- **Contre :** 1-2 phrases sur les arguments des opposants (même poids que les arguments pour)

**Qui est concerné ?**
1 phrase sur qui est directement impacté par cette décision.

NEUTRALITÉ - RÈGLES ABSOLUES :
1. JAMAIS de jugement de valeur : pas de "bonne foi", "juste", "important", "nécessaire", "dangereux"
2. JAMAIS présenter un résultat comme positif ou négatif - décrire factuellement ce qui change
3. Présenter les arguments POUR et CONTRE avec le même poids et la même longueur
4. Ne PAS rassurer le lecteur - c'est du parti-pris
5. Ne PAS utiliser de formulations qui prennent parti : "renforcer la lutte contre" (= c'est bien). Préférer : "augmenter les contrôles sur..."
6. Vote ADOPTÉ : "cette mesure entre en vigueur" / "cela signifie que..."
7. Vote REJETÉ : "cette mesure n'a pas été retenue" / "le texte initial est maintenu"
8. Traduire TOUT le jargon parlementaire en français courant
9. JAMAIS inventer de mesures concrètes absentes des données fournies
10. Si les données sont trop minces pour identifier un impact citoyen : confidence < 40
11. Votes purement procéduraux : confidence < 40
12. Ne PAS commencer par "Ce vote..." - varier les accroches, mais le sujet de l'accroche reste le texte, la loi ou les parlementaires, jamais le lecteur
13. Si le scrutin porte sur un amendement, expliquer DANS LE CONTEXTE DE LA LOI ce que l'amendement proposait de modifier
14. Pour les motions de censure : seuls les députés favorables à la censure votent POUR. La motion est rejetée si le seuil de majorité absolue (289/577) n'est pas atteint, PAS parce que des députés ont voté contre.

VULGARISATION - RÈGLES CRITIQUES :
15. JAMAIS référencer un numéro d'article seul - TOUJOURS expliquer en langage courant le sujet
16. JAMAIS utiliser de termes techniques sans les expliquer
17. Commencer par poser le CONTEXTE concret avant d'entrer dans le détail
18. JAMAIS briser le 4e mur ("sans avoir le contenu exact", "les informations disponibles"). Si tu ne sais pas, confidence < 40
19. Si le titre mentionne un "projet de loi relatif à X", expliquer ce que X signifie concrètement

SOURCES OFFICIELLES - RÈGLES PRIORITAIRES :
20. Si un bloc <sources-officielles> est fourni, la section "Ce qui était proposé" doit décrire UNIQUEMENT la mesure contenue dans ce bloc (c'est le texte exact de l'amendement voté). C'est ta seule source pour la mesure.
21. Dans ce cas, le CONTEXTE GÉNÉRAL (résumé du scrutin, résumé du dossier, titre) ne sert qu'à poser le décor de la loi. Il est INTERDIT de t'en servir pour décrire ce que l'amendement proposait : ces textes parlent de la loi entière, pas de cet amendement précis.
22. Si <sources-officielles> ne permet pas d'identifier une mesure concrète, ne l'invente pas à partir du contexte général : confidence < 40.

RÉPONSE : Tu DOIS répondre en JSON avec exactement deux champs :
- "citizen_impact" : l'explication en markdown structuré
- "confidence" : entier 0-100 (80+ = impact clair, 40-79 = indirect, <40 = procédural)`;

// ============================================
// MAIN FUNCTION
// ============================================

export async function generateCitizenImpact(
  input: CitizenImpactInput
): Promise<CitizenImpactOutput> {
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
    const parsed = parseMistralJSON<{ citizen_impact: string; confidence: number }>(text);
    return {
      citizenImpact: sanitizeOutput(parsed.citizen_impact ?? "", input.chamber),
      confidence: parsed.confidence ?? 0,
    };
  } catch {
    return { citizenImpact: "", confidence: 0 };
  }
}

export { MISTRAL_MODEL };

// ============================================
// HELPERS
// ============================================

/**
 * Rewrites that put the parliamentary act back on the parliamentarians. The
 * reader is a citizen reading the record of a vote that already happened: they
 * did not cast it and did not attend it. The prompt forbids these formulations,
 * but a model slip must never reach a page, so the closed set below is repaired
 * deterministically. `subject` is "les députés" / "les sénateurs".
 */
// Parliamentary-procedure nouns a rewrite is allowed to key off of. Kept
// narrow and shared so "assistez à"/"participez à" only fire when the object
// is plainly about this scrutin's own proceedings — not the reader's
// unrelated civic life (a public rally, a hearing, a sports event...).
// Covers both the direct object ("un débat", "l'adoption") and the "une
// étape de/du l'examen/vote/discussion/création/procédure" phrasing the
// model also uses, confirmed against a full production-data audit.
const PARLIAMENTARY_OBJECT =
  "(?:(?:(?:un|ce|cette|le|une)\\s+|l['’])(?:vote|scrutin|débat|examen|adoption|séance|procédure)|" +
  "une étape procédurale|" +
  "(?:un moment|une étape)\\s+(?:de\\s+l['’]|du|de\\s+la|d['’]|de)\\s*(?:examen|vote|discussion|création|adoption|procédure|processus))";
// Ways to name the thing this scrutin voted on, for "vous avez voté pour/contre X".
const VOTE_TARGET_OBJECT =
  "(?:ce|cet|cette|le|la|l['’])\\s+(?:amendement|texte|article|projet|proposition|mesure)";

const READER_AS_VOTER_REWRITES: { pattern: RegExp; to: (subject: string) => string }[] = [
  { pattern: /\bvous votez sur\b/gi, to: (s) => `${s} ont voté sur` },
  { pattern: /\bvous allez voter sur\b/gi, to: (s) => `${s} ont voté sur` },
  { pattern: /\bvous avez voté sur\b/gi, to: (s) => `${s} ont voté sur` },
  // NOTE: deliberately no bare "vous votez" pattern. A production-data audit
  // found it firing on entirely unrelated, correct civic-education framing —
  // "Vous votez chaque année le budget de l'État à travers vos représentants"
  // (639 rows) and "Vous votez pour élire vos conseillers municipaux" (80+
  // rows) both describe the reader's own, separate vote and got mangled into
  // a circular "Les députés ont voté... à travers vos représentants". Present
  // tense "vous votez" essentially never refers to THIS scrutin (a scrutin is
  // always in the past by the time this text is read), so there is no safe
  // bare form to add back — only the "sur" variant above is trustworthy.
  //
  // Bare "vous avez voté" is scoped two ways instead of matched unconditionally:
  // Trailing lookahead everywhere below (not \b): JS's \b only treats ASCII
  // [A-Za-z0-9_] as "word" characters, so a plain \b right after the accented
  // "é" never matches when "voté" is followed by punctuation like a comma —
  // both sides read as "non-word" and no boundary is found.
  {
    // Relative clause referring back to this scrutin: "l'article 23, que
    // vous avez voté, concerne..." / "...sur lequel vous avez voté...". The
    // lookbehind doesn't consume "que"/"sur lequel", so it's left untouched.
    pattern: /(?<=\b(?:que|qu['’]|sur lequel|sur laquelle)\s)vous avez voté(?!\p{L})/giu,
    to: (s) => `${s} ont voté`,
  },
  {
    // Main clause naming what was voted on: "Vous avez voté pour cet
    // amendement" / "...contre le texte". Excludes "si vous avez voté aux
    // élections municipales" and similar — "élections/conseillers/maire" are
    // not in VOTE_TARGET_OBJECT, so that reader-owned-vote framing is left alone.
    pattern: new RegExp(`\\bvous avez voté(?=\\s+(?:pour|contre)\\s+${VOTE_TARGET_OBJECT})`, "giu"),
    to: (s) => `${s} ont voté`,
  },
  // "le texte que vous examinons" — same bug (reader cast as the body examining
  // the bill), different verb. Absorbs "que" into the replacement for the
  // elision ("qu'examinent"), since only "vous examinons" alone isn't wrong French.
  { pattern: /\bque vous examinons\b/gi, to: (s) => `qu'examinent ${s}` },
  {
    pattern: /\bvous assistez à (?:un|ce|le) (?:vote|scrutin) sur\b/gi,
    to: (s) => `${s} ont voté sur`,
  },
  // Bare "assistez à"/"participez à" require a parliamentary-procedure object
  // (see PARLIAMENTARY_OBJECT) — a production-data audit found the previous
  // fully-unconditional versions rewriting the reader's OWN participation in
  // public gatherings ("vous êtes concerné si vous participez à des
  // rassemblements publics...", on a public-order bill) into a nonsensical
  // claim about the deputies. The lookahead doesn't consume the object, so
  // its exact wording ("un débat sur...", "l'examen d'une proposition...")
  // survives untouched.
  {
    pattern: new RegExp(`\\bvous assistez à(?=\\s+${PARLIAMENTARY_OBJECT}\\b)`, "gi"),
    to: (s) => `${s} ont pris part à`,
  },
  {
    pattern: /\bvous (?:êtes|etes) appelé(?:·e|\(e\)|e)?s? à (?:voter sur|vous prononcer sur)\b/gi,
    to: (s) => `${s} se sont prononcés sur`,
  },
  { pattern: /\bvous vous prononcez sur\b/gi, to: (s) => `${s} se sont prononcés sur` },
  {
    pattern: new RegExp(`\\bvous participez à(?=\\s+${PARLIAMENTARY_OBJECT}\\b)`, "gi"),
    to: (s) => `${s} ont participé à`,
  },
  // Scoped to the specific outcome phrasing the prompt itself uses (rule 6/7:
  // "cette mesure entre en vigueur" / "n'a pas été retenue" — restated here as
  // the model sometimes writes it as "Votre vote a été rejeté/adopté"). A bare
  // \bvotre vote\b would also catch "Votre vote aux municipales..." or "Votre
  // vote compte", which are legitimately about the reader's own ballot.
  { pattern: /\bvotre vote(?=\s+a été (?:rejeté|adopté))\b/gi, to: () => "ce vote" },
];

/**
 * Applies a rewrite while keeping the matched text's leading case, so a
 * mid-sentence occurrence does not gain a stray capital letter.
 */
function rewritePreservingCase(
  text: string,
  pattern: RegExp,
  to: (subject: string) => string,
  subject: string
): string {
  return text.replace(pattern, (match) => {
    const replacement = to(subject);
    return /^[A-ZÀ-Ý]/.test(match)
      ? replacement.charAt(0).toUpperCase() + replacement.slice(1)
      : replacement;
  });
}

/**
 * Removes formulations that cast the reader as a participant in the vote
 * ("Vous votez sur...", "Vous assistez à un vote...", "Votre vote..."). Exported
 * so existing stored impacts can be repaired without a model call.
 */
export function neutralizeReaderAsVoter(text: string, chamber: "AN" | "SENAT"): string {
  const subject = chamber === "SENAT" ? "les sénateurs" : "les députés";
  let result = text;
  for (const { pattern, to } of READER_AS_VOTER_REWRITES) {
    result = rewritePreservingCase(result, pattern, to, subject);
  }
  return result;
}

function sanitizeOutput(text: string, chamber: "AN" | "SENAT"): string {
  let result = text;
  result = result.replace(/https?:\/\/(assemblee|votes|partis|elections|politiques)\//g, "/$1/");
  result = result.replace(/\]\(\((\/.+?)\)\)/g, "]($1)");
  result = neutralizeReaderAsVoter(result, chamber);
  return result;
}

/**
 * Renders the OFFICIAL amendment substance as an XML block. One <source> per
 * resolved block, carrying its provenance (type, field, trust, amendment number,
 * article ref). This is the SOLE measure-bearing source when present.
 */
function buildOfficialSourcesXml(blocks: SubstanceTextBlock[]): string {
  return blocks
    .map((b) => {
      const amd = b.meta?.amendmentNumber
        ? ` amendement="${escapeXmlText(b.meta.amendmentNumber)}"`
        : "";
      const art = b.meta?.articleRef ? ` article="${escapeXmlText(b.meta.articleRef)}"` : "";
      return `  <source type="${escapeXmlText(b.sourceType)}" ref="${escapeXmlText(b.sourceId)}" field="${escapeXmlText(b.field)}" trust="${escapeXmlText(b.trust)}"${amd}${art}>${escapeXmlText(b.text)}</source>`;
    })
    .join("\n");
}

export function buildUserMessage(input: CitizenImpactInput): string {
  const sections: string[] = [];
  const hasOfficial = input.substanceBlocks.length > 0;

  sections.push(`SCRUTIN : ${input.title}`);
  sections.push(
    `Résultat : ${input.result === "ADOPTED" ? "ADOPTÉ" : "REJETÉ"} (${input.votesFor} pour, ${input.votesAgainst} contre, ${input.votesAbstain} abstentions)`
  );
  sections.push(`Chambre : ${input.chamber === "AN" ? "Assemblée nationale" : "Sénat"}`);
  sections.push(`Date : ${input.votingDate}`);
  if (input.theme) sections.push(`Thème : ${input.theme}`);

  if (hasOfficial) {
    // OFFICIAL amendment text — the only basis for "Ce qui était proposé".
    sections.push("");
    sections.push(
      'SOURCES OFFICIELLES (texte exact de l\'amendement voté — SEULE base pour décrire la mesure dans "Ce qui était proposé") :'
    );
    sections.push("<sources-officielles>");
    sections.push(buildOfficialSourcesXml(input.substanceBlocks));
    sections.push("</sources-officielles>");

    // Everything else is background only. Demoted, explicitly non-measure.
    const contextLines: string[] = [];
    if (input.summary) contextLines.push(`Résumé du scrutin : ${input.summary}`);
    if (input.dossierTitle) contextLines.push(`Loi concernée : ${input.dossierTitle}`);
    if (input.dossierSummary) contextLines.push(`Résumé du dossier : ${input.dossierSummary}`);
    if (input.sourcePageText) contextLines.push(`Page source : ${input.sourcePageText}`);
    if (contextLines.length > 0) {
      sections.push("");
      sections.push(
        'CONTEXTE GÉNÉRAL (pose le décor de la loi — NE décrit PAS la mesure votée, ne PAS l\'utiliser pour "Ce qui était proposé") :'
      );
      sections.push(...contextLines);
    }
  } else {
    // Legacy layout: no usable amendment text (whole-text vote, motion, etc.).
    if (input.summary) {
      sections.push("");
      sections.push("RÉSUMÉ EXISTANT :");
      sections.push(input.summary);
    }

    if (input.dossierTitle || input.dossierSummary) {
      sections.push("");
      sections.push("DOSSIER LÉGISLATIF :");
      if (input.dossierTitle) sections.push(`Titre : ${input.dossierTitle}`);
      if (input.dossierSummary) sections.push(`Résumé : ${input.dossierSummary}`);
    }

    if (input.sourcePageText) {
      sections.push("");
      sections.push("CONTENU DE LA PAGE SOURCE :");
      sections.push(input.sourcePageText);
    }
  }

  const linkLines: string[] = [];
  if (input.links.dossierUrl) {
    linkLines.push(`Dossier législatif : [${input.links.dossierLabel}](${input.links.dossierUrl})`);
  }
  for (const v of input.links.relatedVotes) {
    linkLines.push(`Vote lié : [${v.label}](${v.url})`);
  }
  for (const p of input.links.politicians) {
    linkLines.push(`Député·e (${p.position}) : [${p.label}](${p.url})`);
  }
  if (linkLines.length > 0) {
    sections.push("");
    sections.push("LIENS DISPONIBLES (à insérer dans l'explication quand pertinent) :");
    sections.push(...linkLines);
  }

  return sections.join("\n");
}
