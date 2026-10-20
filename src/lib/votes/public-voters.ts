import { PUBLIC_POLITICIAN_PUBLICATION_STATUS } from "@/lib/api/public-contract";

interface VoteWithPoliticianStatus {
  politician: { publicationStatus: string };
}

/**
 * The votes whose author may be named on a public page: a brouillon or unpublished politician
 * keeps their rows in `Vote` (the individual votes are imported by official identifier) but
 * neither their name nor a link to a profile that does not exist may be shown.
 *
 * Only for what is displayed. The coverage of a scrutin counts every stored row, public or not:
 * it measures the import against the official counts, not the names on the page.
 */
export function publicVotes<T extends VoteWithPoliticianStatus>(votes: readonly T[]): T[] {
  return votes.filter(
    (vote) => vote.politician.publicationStatus === PUBLIC_POLITICIAN_PUBLICATION_STATUS
  );
}
