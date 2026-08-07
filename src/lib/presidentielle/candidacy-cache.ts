import { revalidateTags } from "@/lib/cache";

/**
 * Invalidation for the surfaces that depend on a `CandidacyPresidential` publication status.
 *
 * Why a tag of its own, next to `election-measures:${electionId}`. The four cached reads of the
 * hub (subject page, themes index, hub context, priorities) all filter on
 * `CandidacyPresidential.publicationStatus`, directly or through `getPublicPresidentialCandidates`.
 * They carried only the measures tag, while the extension mutations called
 * `invalidateEntity("election")`, which purges the `elections` tag. Those two sets do not overlap
 * at all, so a DRAFT -> PUBLISHED transition busted NONE of the four: they stayed closed until the
 * 24h ISR backstop, with the data already in place.
 *
 * Same policy as `invalidateMeasureTags`: best effort, logged, no retry. `revalidateTag` is a call
 * to the hosting platform, not SQL, so describing it as atomic with the transaction would be wrong,
 * and throwing here would make the caller believe a committed mutation had failed.
 */
export function invalidatePresidentialCandidacyTags(electionId: string): void {
  try {
    // One targeted tag, never the global one: purging the global tag once blew through this
    // project's hosting spend cap.
    revalidateTags([`election-candidacies:${electionId}`]);
  } catch (error) {
    // The only trace of a lost invalidation, which leaves the surfaces closed until their
    // cacheLife profile expires.
    // eslint-disable-next-line no-console -- deliberate ops signal
    console.error(`[presidentielle] cache invalidation failed for election ${electionId}`, error);
  }
}
