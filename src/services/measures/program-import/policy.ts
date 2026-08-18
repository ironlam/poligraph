import type { ExtractedProposal, ProgramDocumentType } from "./types";

export type AcceptanceGuard =
  | "NON_ACTION_CLASSIFICATION"
  | "MISSING_THEME"
  | "MISSING_NORMALIZED_TEXT"
  | "LOW_CONFIDENCE"
  | "HISTORICAL_REFERENCE"
  | "TITLE_WITHOUT_ACTION"
  | "TITLE_OR_NOMINAL_LABEL"
  | "DEPENDENT_FRAGMENT"
  | "MISSING_REFERENT"
  | "CORRUPTED_SOURCE_TEXT"
  | "SLOGAN_OR_PRINCIPLE"
  | "DESCRIPTIVE_EXISTING_POLICY"
  | "INSUFFICIENT_ATTRIBUTION"
  | "GENERAL_INTENT_FORMULATION"
  | "RHETORICAL_FORMULATION";

export const ACCEPTANCE_POLICY_VERSION = "presidential-program-acceptance-2026-08-16-v3";

export type FinalizedProposal = ExtractedProposal & {
  acceptanceGuard: AcceptanceGuard | null;
  accepted: boolean;
};

export function classifyEdition(
  ownerType: "PARTY" | "CANDIDACY",
  label: string,
  documentText = ""
): ProgramDocumentType {
  if (ownerType === "PARTY") {
    return /édition 20(?:1|2)[0-5]|histor/i.test(label)
      ? "PARTY_PLATFORM_HISTORICAL"
      : "PARTY_PLATFORM_CURRENT";
  }
  if (
    /programme officiel[^.]{0,100}(?:arrive|sera (?:publié|dévoilé)|prochainement)/i.test(
      documentText
    )
  ) {
    return "CANDIDATE_PROPOSALS_2027";
  }
  const positiveProgramEvidence =
    /programme (?:présidentiel|officiel)[^.]{0,120}(?:présidentielle|2027)/i.test(documentText) ||
    /(?:présidentielle|2027)[^.]{0,120}programme (?:présidentiel|officiel)/i.test(documentText);
  return positiveProgramEvidence ? "CANDIDATE_PROGRAM_2027" : "CANDIDATE_PROPOSALS_2027";
}

export function isHistoricalStatement(sourceText: string): boolean {
  const hasHistoricalYear = [...sourceText.matchAll(/\b(?:19|20)(\d{2})\b/g)].some(
    (match) => Number(`20${match[1]}`) <= 2025 || match[0].startsWith("19")
  );
  const hasPastAction =
    /\b(?:a|ont|avait|avaient)\s+(?:supprim|cré|présent|adopt|instaur|lanc|vot|publi|accord|expériment)\p{L}*\b/iu.test(
      sourceText
    ) ||
    /\b(?:supprimée?s?|créée?s?|présentée?s?|adoptée?s?|instaurée?s?|lancée?s?|votée?s?|publiée?s?|accordée?s?|expérimentée?s?)\b/iu.test(
      sourceText
    ) ||
    /\b(?:n['’]\s*a\s+fait|avait|avaient|fut|furent)\b/iu.test(sourceText);
  if (
    !hasPastAction ||
    (!hasHistoricalYear && !/\b(?:n['’]\s*a\s+fait|avait|avaient|fut|furent)\b/iu.test(sourceText))
  ) {
    return false;
  }

  const hasForwardCommitment =
    /\b(?:nous|je)\s+\p{L}*(?:erons|irons|rons|rai)\b/iu.test(sourceText) ||
    /\b(?:sera|seront|devra|devront|nous proposons|nous voulons|il s’agit)\b/iu.test(sourceText) ||
    /^\s*(?:créer|instaurer|supprimer|rétablir|garantir|interdire|encadrer|augmenter|réduire|mettre)\b/iu.test(
      sourceText
    );
  return !hasForwardCommitment;
}

function isProgrammaticTitleWithoutAction(sourceText: string): boolean {
  const text = sourceText.trim();
  return (
    (/^(?:pour\s+(?:un|une|le|la|les)\b|(?:notre|nos)\s+(?:projet|propositions?)\b)/iu.test(text) &&
      !/\b(?:sera|seront|devra|devront|nous\s+\p{L}*(?:erons|irons|rons)|je\s+\p{L}*rai)\b/iu.test(
        text
      )) ||
    (/^\d+\s+[\p{Lu}\s]+[.!]?$/u.test(text) &&
      !/\b(?:CRÉER|INSTAURER|SUPPRIMER|RÉTABLIR|GARANTIR|INTERDIRE|ENCADRER|AUGMENTER|RÉDUIRE|METTRE|RENDRE)\b/u.test(
        text
      ))
  );
}

const AUTONOMOUS_ACTION_OPENING =
  /^(?:(?:mieux|davantage)\s+)?(?:créer|supprimer|instaurer|rétablir|garantir|interdire|encadrer|augmenter|réduire|mettre|rendre|reconnaître|conditionner|financer|fusionner|publier|ouvrir|développer|protéger|renforcer|rénover|réformer|généraliser|indexer|doubler|limiter|réserver|imposer|étendre|assurer|améliorer|favoriser|permettre|faciliter|soutenir|investir|consacrer|comptabiliser|former|recruter|sanctionner|contrôler|payer|redonner)\b/iu;

function isNominalLabelWithoutAction(sourceText: string): boolean {
  const text = sourceText.trim();
  if (text.split(/\s+/).length > 8) return false;
  if (AUTONOMOUS_ACTION_OPENING.test(text)) return false;
  if (
    /^(?:création|suppression|instauration|rétablissement|interdiction|encadrement|augmentation|réduction|fusion|obligation|extension|conditionnement|financement)\b/iu.test(
      text
    )
  ) {
    return false;
  }
  if (/^(?:nous|je|on|il|elle|ils|elles|ce|cet|cette|ces)\b/iu.test(text)) return false;
  return /^(?:(?:un|une|le|la|les|des)\s+)?[\p{L}'’.-]+(?:\s+[\p{L}'’.-]+){0,3}\s+(?:pour|à|aux|de|du|des)\b/iu.test(
    text
  );
}

function isManifestlyCorruptedSourceText(sourceText: string): boolean {
  const text = sourceText.trim();
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(text)) return true;
  const openingParentheses = (text.match(/\(/g) ?? []).length;
  const closingParentheses = (text.match(/\)/g) ?? []).length;
  const openingBrackets = (text.match(/\[/g) ?? []).length;
  const closingBrackets = (text.match(/\]/g) ?? []).length;
  return closingParentheses > openingParentheses || closingBrackets > openingBrackets;
}

function hasMissingReferent(sourceText: string): boolean {
  const text = sourceText.trim();
  const purposeAction = text.match(
    /^(?:nous|on|il|elle)\s+(?:en|y)\s+\p{L}+\s+pour\s+(.+)$/iu
  )?.[1];
  if (purposeAction && AUTONOMOUS_ACTION_OPENING.test(purposeAction)) return false;
  if (/^(?:nous|on|il|elle)\s+(?:en|y)\s+\p{L}+/iu.test(text)) return true;
  if (/^(?:nous|on|il|elle)\s+(?:lui|leur)\s+\p{L}+/iu.test(text)) return true;

  const demonstrativeReferent =
    /\b(?:ce|cet|cette|ces)\s+((?:haute\s+)?(?:règle|mesure|plan|projet|présence|dispositif|réforme|proposition|principe|objectif|autorité|possibilité|part|emplois?\s+aidés?|détournement|système|mécanisme|texte|loi|taxe))(?!\p{L})/giu;
  for (const match of text.matchAll(demonstrativeReferent)) {
    const nounPhrase = match[1]!.toLocaleLowerCase("fr");
    const matchIndex = match.index ?? 0;
    const prefix = text.slice(0, matchIndex);
    const suffix = text.slice(matchIndex + match[0].length);
    const baseNoun = nounPhrase.split(/\s+/).at(-1)!;
    const earlierExplicitMention = new RegExp(
      `\\b(?:un|une|le|la|les|des|l['’])\\s+(?:haute\\s+)?${baseNoun}(?!\\p{L})`,
      "iu"
    ).test(prefix);
    if (earlierExplicitMention) continue;

    if (nounPhrase === "possibilité" && /^\s+d(?:e|['’])\s*\p{L}+(?:er|ir|re)\b/iu.test(suffix)) {
      continue;
    }
    if (
      nounPhrase.includes("autorité") &&
      /^\s+(?:(?:de|d['’]|à|pour)\s+|(?:chargée|responsable)\s+d(?:e|['’])\s*)\p{L}+/iu.test(suffix)
    ) {
      continue;
    }
    if (nounPhrase === "part" && /^\s+(?:du|de\s+la|des|d['’])\s+[\p{Lu}][\p{L}-]+/u.test(suffix)) {
      continue;
    }
    if (
      nounPhrase.includes("emploi") &&
      /^\s+(?:créés?|destinés?|réservés?)\s+(?:à|pour)\b/iu.test(suffix)
    ) {
      continue;
    }
    if (
      !["possibilité", "part", "détournement"].includes(nounPhrase) &&
      !nounPhrase.includes("emploi") &&
      /^\s+(?:de|d['’]|du|des|à|pour|sur|contre)\s+\p{L}+/iu.test(suffix)
    ) {
      continue;
    }
    return true;
  }
  return false;
}

function isDependentFragment(sourceText: string): boolean {
  const text = sourceText.trim();
  if (
    /^(?:que\b|qu['’]|contre\b|non\s+pour\b|il\s+en\s+sera\s+de\s+même\b|ceci\b|cela\b|ça\b)/iu.test(
      text
    )
  ) {
    return true;
  }
  if (
    /^(?:(?:et|mais)\s+(?:(?:aussi|également)\s+)?en\s+|ainsi\s+qu['’]en\s+)\p{L}+ant\b/iu.test(
      text
    )
  ) {
    return true;
  }
  if (
    /^(?:les|leur|lui)\s+\p{L}+(?:er|ir|re)\b(?:\s*,\s*(?:les|leur|lui)\s+\p{L}+(?:er|ir|re)\b)+/iu.test(
      text
    )
  ) {
    return true;
  }
  if (!/^(?:des|de la|du|une?)\b/iu.test(text)) return false;
  const hasFiniteVerb =
    /\b(?:est|sont|sera|seront|cesse|cessent|compte|comptent|doit|doivent|peut|peuvent|pourra|pourront|aura|auront|\p{L}+(?:era|ira|ront))\b/iu.test(
      text
    );
  const hasActionNoun =
    /\b(?:suppression|création|instauration|interdiction|priorisation|obligation|augmentation|réduction)\b/iu.test(
      text
    );
  return !hasFiniteVerb && !hasActionNoun;
}

function isSloganOrPrinciple(sourceText: string): boolean {
  const text = sourceText.trim();
  return (
    (/^[\p{Lu}\s'’&-]+!$/u.test(text) && /\b\p{L}+(?:ons|ez)\b/iu.test(text)) ||
    /\b(?:défend\p{L}*|pos\p{L}*)\s+(?:le|un)\s+principe\b/iu.test(text) ||
    /\b(?:payer|paie|paient)\s+au\s+prix\s+fort\b/iu.test(text) ||
    /\bgagner\s+sa\s+croûte\b/iu.test(text) ||
    /\bmettre\s+\p{L}[\p{L}-]*\s+au\s+chômage\b/iu.test(text) ||
    /^«?\s*que\b[^.!?]*[.!?]?\s*»?$/iu.test(text)
  );
}

function isExistingPolicyDescription(sourceText: string): boolean {
  const text = sourceText.trim();
  const hasCommitment =
    /\b(?:nous|je)\s+\p{L}*(?:erons|irons|rons|rai)\b/iu.test(text) ||
    /\b(?:sera|seront|devra|devront|pourra|pourront|nous proposons|nous voulons|il faut|il nous faut)\b/iu.test(
      text
    ) ||
    /^\s*(?:créer|instaurer|supprimer|rétablir|garantir|interdire|encadrer|augmenter|réduire|mettre|rendre|reconnaître)\b/iu.test(
      text
    );
  if (hasCommitment) return false;
  return /\b(?:fixe|conserve(?:nt)?|dispose(?:nt)?|existe(?:nt)?|prévoit|permet)\b/iu.test(text);
}

function hasInsufficientAttribution(sourceText: string): boolean {
  return /^(?:\s*il\s+faudrait\b|\s*on\s+(?:demande|voudrait|souhaite|propose)\b)/iu.test(
    sourceText
  );
}

function isGenericIntentFormulation(sourceText: string): boolean {
  const text = sourceText.trim();
  if (/^notre\s+but\b/iu.test(text)) return true;
  if (/\bremettre\s+(?:cela|ça|ceci|[^.!?]{0,80})\s*en\s+cause\b/iu.test(text)) return true;
  if (/\bil\s+importe\s+qu['’][^.!?]*\bdonner\s+le\s+sentiment\b/iu.test(text)) return true;
  if (!/^nous\s+voulons\s+(?:une?|des|le|la|les)\b/iu.test(text)) return false;
  return !/\b(?:mobilisation|suppression|création|instauration|interdiction|réforme|priorisation|obligation|loi|droit|statut)\b/iu.test(
    text
  );
}

function isRhetoricalFormulation(sourceText: string): boolean {
  const text = sourceText.trim();
  const targetsNamedThirdParty =
    /\bpour\s+(?:(?:le|la)\s+(?:groupe|société|entreprise)\s+)?[\p{Lu}][\p{L}-]+(?:\s+[\p{Lu}][\p{L}-]+)*/u.test(
      text
    );
  return (
    /^(?:pas\s+des?\b|former\s*,\s*recruter\s*,\s*transmettre\b)/iu.test(text) ||
    /\bdoivent\s+(?:être\s+)?(?:sanctionnés|empêchés)\b/iu.test(text) ||
    /\bdoit\s+en\s+payer\s+le\s+prix\b/iu.test(text) ||
    /^nous\s+voulons\s+(?:aussi\s+)?que\b[^.!?]*\bassument?\b/iu.test(text) ||
    /^investir\b[^.]*\bce\s+n['’]est\b[^.]*\bc['’]est\b/iu.test(text) ||
    (/^fini(?:e|es|s)?\b/iu.test(text) && targetsNamedThirdParty) ||
    /^il\s+est\s+(?:urgent|grand\s+temps|temps)\s+de\s+mettre\s+fin\s+à\s+(?:ce|cette|la|le|l['’])\s*(?:trahison|injustice|abandon|scandale|dérive|logique)\b/iu.test(
      text
    )
  );
}

/**
 * Vérifie que la citation peut porter seule la proposition affichée. Cette frontière est
 * partagée par MEASURE et OBJECTIVE et ne peut que rejeter une sortie du modèle.
 */
export function evaluateTextualSufficiency(sourceText: string): AcceptanceGuard | null {
  if (isProgrammaticTitleWithoutAction(sourceText)) return "TITLE_OR_NOMINAL_LABEL";
  if (isDependentFragment(sourceText)) return "DEPENDENT_FRAGMENT";
  if (isGenericIntentFormulation(sourceText)) return "GENERAL_INTENT_FORMULATION";
  if (hasMissingReferent(sourceText)) return "MISSING_REFERENT";
  if (isSloganOrPrinciple(sourceText)) return "SLOGAN_OR_PRINCIPLE";
  if (isRhetoricalFormulation(sourceText)) return "RHETORICAL_FORMULATION";
  if (isNominalLabelWithoutAction(sourceText)) return "TITLE_OR_NOMINAL_LABEL";
  return null;
}

export function evaluateProposalAutonomy(proposal: ExtractedProposal): AcceptanceGuard | null {
  return evaluateTextualSufficiency(proposal.sourceText);
}

/**
 * Fail-closed acceptance boundary. The model alone chooses MEASURE or OBJECTIVE.
 * This layer can only reject an unsafe or non-autonomous excerpt, never promote one.
 */
export function getProposalAcceptanceGuard(proposal: ExtractedProposal): AcceptanceGuard | null {
  if (proposal.classification !== "MEASURE" && proposal.classification !== "OBJECTIVE") {
    return "NON_ACTION_CLASSIFICATION";
  }
  if (proposal.theme === null) return "MISSING_THEME";
  if (proposal.normalizedText === null) return "MISSING_NORMALIZED_TEXT";
  if (proposal.confidence < 0.75) return "LOW_CONFIDENCE";
  if (
    proposal.segmentProvenance === "TEXT_LAYER_SUSPECT" ||
    proposal.segmentProvenance === "TEXT_LAYER_CORRUPTED"
  ) {
    return "CORRUPTED_SOURCE_TEXT";
  }
  if (isManifestlyCorruptedSourceText(proposal.sourceText)) return "CORRUPTED_SOURCE_TEXT";
  if (proposal.historicalContext || isHistoricalStatement(proposal.sourceText)) {
    return "HISTORICAL_REFERENCE";
  }
  if (isExistingPolicyDescription(proposal.sourceText)) return "DESCRIPTIVE_EXISTING_POLICY";
  if (hasInsufficientAttribution(proposal.sourceText)) return "INSUFFICIENT_ATTRIBUTION";
  return evaluateProposalAutonomy(proposal);
}

/**
 * Canonical, idempotent decision path used by imports and report reconciliation.
 * A missing normalization may only fall back to the already grounded exact citation.
 */
export function finalizeProposalForReview(proposal: ExtractedProposal): FinalizedProposal {
  const withSafeNormalization =
    proposal.normalizedText === null &&
    proposal.extractionGuard === null &&
    (proposal.classification === "MEASURE" || proposal.classification === "OBJECTIVE")
      ? {
          ...proposal,
          normalizedText: proposal.sourceText,
          rationale: "Normalisation exacte remplacée par la citation source grounded.",
          exactSourceFallback: true,
        }
      : { ...proposal, exactSourceFallback: proposal.exactSourceFallback ?? false };
  const acceptanceGuard = getProposalAcceptanceGuard(withSafeNormalization);
  return {
    ...withSafeNormalization,
    acceptanceGuard,
    accepted: acceptanceGuard === null,
  };
}

export function isAcceptedProposal(proposal: ExtractedProposal): boolean {
  return finalizeProposalForReview(proposal).accepted;
}
