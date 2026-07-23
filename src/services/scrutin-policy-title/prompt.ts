import { escapeXmlText } from "@/lib/text/escape-xml";
import type { SubstanceTextBlock, EvidenceCandidate } from "./types";

export const PROMPT_VERSION = "policy-title-v3";

export interface BuildPromptArgs {
  scrutinTitle: string;
  proceduralLabel: string;
  result: string;
  votingDate: string;
  blocks: SubstanceTextBlock[];
  candidates: EvidenceCandidate[];
  citizenImpact: string | null;
}

const SYSTEM_PROMPT = `Tu es rédacteur de vulgarisation parlementaire pour un site de transparence citoyenne.

Ta mission : transformer le libellé procédural d'un vote en un titre clair qui répond à une seule question : qu'est-ce qui change concrètement si ce vote passe ?

Écris en français, avec tous les accents (é, è, ê, à, ô, ç, ù, î, û, ë). N'utilise jamais de tiret cadratin ni de tiret demi-cadratin : préfère la virgule, les parenthèses, le deux-points ou le point.

Mauvais exemples (procéduraux, à proscrire) :
- "Rétablir l'article 8 du projet de loi agricole"
- "Adopter l'amendement du Gouvernement"

Bon exemple (concret, parle au citoyen) :
- "Limiter les dérogations aux seuils de qualité de l'eau"

Neutralité absolue : décris UNIQUEMENT ce que la mesure ferait, jamais l'intention, l'opinion ou la critique de son auteur. L'exposé sommaire contient souvent le point de vue de l'auteur (par exemple "dispositif inefficace", "coût excessif", "concurrence déloyale") : ce sont des arguments, PAS des faits, ne les reprends jamais dans le titre ni le sous-titre. N'emploie aucun jugement même implicite, aucune comparaison appréciative ("plus … que …", "critiquée pour…"), aucun adjectif évaluatif. Si la mesure demande un rapport, dis "Demander un rapport sur X", pas "Évaluer l'utilité de X critiquée pour…".

Sens du vote (direction) : c'est la règle la plus importante. Beaucoup d'amendements sont "de suppression" ; leur dispositif est "Supprimer cet article". Voter pour un tel amendement RETIRE l'article du texte. Le titre doit alors décrire ce que la suppression produit, jamais le contenu de l'article comme s'il était adopté. Ouvre sur un verbe de retrait, de refus ou de statu quo ("Supprimer…", "Ne pas créer…", "Ne pas étendre…", "Maintenir…"). N'ouvre JAMAIS sur un verbe qui crée ou étend la mesure supprimée ("Autoriser", "Créer", "Prolonger", "Étendre", "Rendre…", "Renforcer") : ce serait inverser le sens du vote.
Exemple, pour un amendement de suppression d'un article qui allonge la garde à vue à 72 heures :
- bon : "Supprimer le régime de garde à vue de 72 heures"
- mauvais : "Prolonger la garde à vue à 72 heures" (ce titre décrit l'article supprimé et inverse le sens du vote)
Cas budgétaire particulier : supprimer un article de loi de finances qui réduit des crédits revient à rétablir ces crédits ; dans ce seul cas, un verbe comme "Rétablir" ou "Augmenter" décrit correctement l'effet de la suppression.

Règle d'ancrage stricte : chaque affirmation concrète doit provenir des extraits du bloc <evidence> ; cite-les dans evidenceQuotes ; ne cite jamais d'autre source. Le bloc <contexte-editorial> est purement informatif et ne constitue PAS une source : n'en extrais aucune citation, ne le mentionne dans aucun evidenceQuotes.

Longueur du titre : vise 90 caractères ou moins. Un titre court et neutre est toujours préférable à un titre long. Ne dépasse jamais 140 caractères. Mets toute précision dans le sous-titre, pas dans le titre.`;

function buildSourcesXml(blocks: SubstanceTextBlock[]): string {
  if (blocks.length === 0) return "  <source />";
  return blocks
    .map(
      (b) =>
        `  <source kind="${escapeXmlText(b.sourceType)}" ref="${escapeXmlText(b.sourceId)}" field="${escapeXmlText(b.field)}" trust="${escapeXmlText(b.trust)}">${escapeXmlText(b.text)}</source>`
    )
    .join("\n");
}

function buildEvidenceXml(candidates: EvidenceCandidate[]): string {
  if (candidates.length === 0) return "  <quote />";
  return candidates
    .map(
      (c) =>
        `  <quote source-type="${escapeXmlText(c.sourceType)}" source-id="${escapeXmlText(c.sourceId)}" field="${escapeXmlText(c.field)}">${escapeXmlText(c.quote)}</quote>`
    )
    .join("\n");
}

export function buildPrompt(args: BuildPromptArgs): { system: string; user: string } {
  const { scrutinTitle, proceduralLabel, result, votingDate, blocks, candidates, citizenImpact } =
    args;

  const user = `<scrutin>
  <titreOfficiel>${escapeXmlText(scrutinTitle)}</titreOfficiel>
  <labelProcedural>${escapeXmlText(proceduralLabel)}</labelProcedural>
  <date>${escapeXmlText(votingDate)}</date>
  <resultat>${escapeXmlText(result)}</resultat>
</scrutin>

<sources>
${buildSourcesXml(blocks)}
</sources>

<evidence>
${buildEvidenceXml(candidates)}
</evidence>

<contexte-editorial role="informational-only">${escapeXmlText(citizenImpact ?? "(aucun)")}</contexte-editorial>

<format>
Réponds UNIQUEMENT par un objet JSON valide, sans texte autour, sans bloc de code. Champs attendus :
  - policyTitle (string) : le titre concret, 90 caractères cible, 140 maximum.
  - policySubtitle (string ou null) : une phrase de précision, ou null.
  - evidenceQuotes (tableau) : objets { sourceType, sourceId, field, quote } repris du bloc <evidence> uniquement.
  - selfConfidence (string) : "HIGH", "MEDIUM" ou "LOW".
  - rationale (string) : justification courte.
</format>`;

  return { system: SYSTEM_PROMPT, user };
}
