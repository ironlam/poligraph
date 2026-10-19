/**
 * Chamber-aware SEO strings for /politiques/[slug]/votes.
 *
 * Metadata must describe the votes actually rendered by the page. The chamber
 * therefore comes from the denormalized Vote.chamber corpus, never from a
 * current or historical mandate. Mixed and empty corpora stay neutral.
 */

export type ParliamentaryChamber = "AN" | "SENAT";

/**
 * Resolve a chamber only when every recorded vote belongs to the same one.
 * Mixed and empty corpora return null so the copy cannot overstate its scope.
 */
export function resolveVoteCorpusChamber(
  chambers: ReadonlyArray<ParliamentaryChamber>
): ParliamentaryChamber | null {
  const uniqueChambers = new Set(chambers);
  return uniqueChambers.size === 1 ? ([...uniqueChambers][0] ?? null) : null;
}

/** "à l'Assemblée nationale" / "au Sénat" — null when the chamber is unknown. */
export function chamberPreposition(chamber: ParliamentaryChamber | null): string | null {
  if (chamber === "AN") return "à l'Assemblée nationale";
  if (chamber === "SENAT") return "au Sénat";
  return null;
}

export interface PoliticianVotesSeo {
  title: string;
  description: string;
  /** Visible H1, enriched only when the chamber is established. */
  heading: string;
}

export function buildPoliticianVotesSeo(
  fullName: string,
  chamber: ParliamentaryChamber | null
): PoliticianVotesSeo {
  const preposition = chamberPreposition(chamber);

  if (!preposition) {
    return {
      title: `Votes parlementaires de ${fullName}`,
      description: `Consultez les votes parlementaires enregistrés pour ${fullName} : textes de loi, amendements et positions enregistrées.`,
      heading: `Votes parlementaires de ${fullName}`,
    };
  }

  return {
    title: `Votes de ${fullName} ${preposition}`,
    description: `Consultez les votes parlementaires de ${fullName} ${preposition} : textes de loi, amendements et positions enregistrées.`,
    heading: `Votes de ${fullName} ${preposition}`,
  };
}

export interface PoliticianVotesIntroInput {
  fullName: string;
  chamber: ParliamentaryChamber | null;
  /** All recorded votes, every scrutin type included. */
  totalVotes: number;
  /** Subset cast on amendments. */
  amendmentVotes: number;
  /** Legislature the counts are limited to, e.g. "17ᵉ législature (depuis 2024)". */
  scopeLabel?: string;
}

/**
 * Short visible intro, built from the tab counts the page already loads: no
 * extra query, no participation rate (issue #717), no reading of the voting
 * behaviour.
 */
export function buildPoliticianVotesIntro({
  fullName,
  chamber,
  totalVotes,
  amendmentVotes,
  scopeLabel,
}: PoliticianVotesIntroInput): string | null {
  if (totalVotes <= 0) {
    return scopeLabel
      ? `Aucun vote de ${fullName} n'est enregistré pour la ${scopeLabel}.`
      : `Aucun vote parlementaire n'est enregistré pour ${fullName}.`;
  }

  const preposition = chamberPreposition(chamber);
  const where = preposition ? ` ${preposition}` : "";
  const count = totalVotes.toLocaleString("fr-FR");

  const lead = scopeLabel ? `Pour la ${scopeLabel}` : "Au total";
  const sentences: string[] = [
    totalVotes > 1
      ? `${lead}, ${count} votes de ${fullName} sont enregistrés${where}.`
      : `${lead}, ${count} vote de ${fullName} est enregistré${where}.`,
  ];

  if (amendmentVotes > 0) {
    sentences.push(
      amendmentVotes > 1
        ? `${amendmentVotes.toLocaleString("fr-FR")} portent sur des amendements.`
        : `${amendmentVotes.toLocaleString("fr-FR")} porte sur un amendement.`
    );
  }

  return sentences.join(" ");
}
