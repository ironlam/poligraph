/**
 * Sur quoi porte un scrutin : une partie du texte, un article, le texte entier.
 *
 * `ScrutinType.FINAL` range « la première partie du projet » avec « l'ensemble
 * du projet » (voir scrutin-type.ts), ce qui est voulu pour le tri mais fait
 * perdre la portée : un décryptage écrit pour un vote sur une partie parlait
 * du texte « dans son intégralité ». La portée est donc dérivée ici, à part.
 */

export type VoteScope = "PART" | "ARTICLE" | "WHOLE" | "OTHER";

const APO = "['’]";
const ORDINAL = "(?:première|deuxième|seconde|troisième|quatrième|cinquième)";

export function classifyVoteScope(title: string): VoteScope {
  const t = title.toLowerCase();

  // Un amendement cite souvent une partie ou un article du texte sans en être le vote.
  if (new RegExp(`l${APO}amendement|les\\s+amendements|sous-amendement`).test(t)) return "OTHER";
  if (/motion\s+(?:de|n°|référendaire)/.test(t)) return "OTHER";

  if (new RegExp(`${ORDINAL}\\s+partie\\s+d(?:u|e\\s+la)\\s+(?:projet|proposition)`).test(t)) {
    return "PART";
  }

  if (
    new RegExp(`l${APO}ensemble\\s+(?:d(?:u|e\\s+la|es)\\s+|la\\s+)(?:projet|proposition)`).test(t)
  ) {
    return "WHOLE";
  }

  if (
    new RegExp(`l${APO}article\\s+(?:\\d+|unique|premier|liminaire)`).test(t) &&
    !t.includes("de la constitution")
  ) {
    return "ARTICLE";
  }

  return "OTHER";
}
