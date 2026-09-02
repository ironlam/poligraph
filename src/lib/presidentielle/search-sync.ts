import type { DbTransactionClient } from "@/lib/db";
import { CANDIDACY_STATUS_LABELS } from "@/config/labels";
import { deleteSearchDocument, upsertSearchDocument } from "@/lib/search/documents";
import { syncSearchDocuments as syncMeasureSearchDocuments } from "@/lib/measures/search-sync";
import { PUBLIC_HUB_CANDIDACY_WHERE } from "./publication";

function latestDate(dates: Array<Date | null | undefined>): Date {
  return dates.reduce<Date>((latest, date) => (date && date > latest ? date : latest), new Date(0));
}

/**
 * Rebuild one candidacy document from database state inside the caller's transaction.
 *
 * Candidacies follow the hub authority, not the stronger fiche authority: a sourced personality
 * is useful in the presidential corpus before PoliGraph has published a complete programme fiche.
 */
export async function syncCandidacySearchDocument(
  tx: DbTransactionClient,
  candidacyId: string
): Promise<void> {
  const candidacy = await tx.candidacy.findUnique({
    where: { id: candidacyId },
    select: {
      id: true,
      electionId: true,
      candidateName: true,
      status: true,
      sourceUrl: true,
      sourceLabel: true,
      updatedAt: true,
      election: { select: { slug: true } },
      presidentialData: { select: { updatedAt: true } },
      politician: {
        select: {
          slug: true,
          fullName: true,
          publicationStatus: true,
          updatedAt: true,
        },
      },
      party: { select: { name: true, shortName: true, updatedAt: true } },
    },
  });

  if (!candidacy) {
    await deleteSearchDocument(tx, "CANDIDACY", candidacyId);
    return;
  }

  const publicCandidacy = await tx.candidacy.findFirst({
    where: { id: candidacyId, ...PUBLIC_HUB_CANDIDACY_WHERE },
    select: { id: true },
  });
  const statusLabel = candidacy.status ? CANDIDACY_STATUS_LABELS[candidacy.status] : null;
  const partyLabel = candidacy.party?.shortName ?? candidacy.party?.name ?? null;
  const body = [candidacy.candidateName, partyLabel, statusLabel].filter(Boolean).join(" ");
  const politicianSlug = candidacy.politician?.slug;

  await upsertSearchDocument(tx, {
    entityType: "CANDIDACY",
    entityId: candidacy.id,
    electionId: candidacy.electionId,
    title: candidacy.candidateName,
    body,
    // A public document always has a linked public politician through the hub predicate. The
    // listing fallback keeps an internal document navigable without manufacturing a dead URL.
    url: politicianSlug
      ? `/elections/${candidacy.election.slug}/candidats/${politicianSlug}`
      : `/elections/${candidacy.election.slug}/candidats`,
    visibility: publicCandidacy ? "PUBLIC" : "ADMIN_ONLY",
    sourceRevisionId: null,
    sourceUpdatedAt: latestDate([
      candidacy.updatedAt,
      candidacy.presidentialData?.updatedAt,
      candidacy.politician?.updatedAt,
      candidacy.party?.updatedAt,
    ]),
  });
}

/**
 * Refresh presidential candidacy and measure documents whose searchable party label changed.
 *
 * The party write and these index writes must share a transaction: otherwise a failed refresh
 * would leave the former party name searchable until the next explicit reconstruction.
 */
export async function syncCandidacySearchDocumentsForParty(
  tx: DbTransactionClient,
  partyId: string
): Promise<string[]> {
  const candidacies = await tx.candidacy.findMany({
    where: { partyId, election: { type: "PRESIDENTIELLE" } },
    select: { id: true, electionId: true },
    orderBy: { id: "asc" },
  });

  for (const candidacy of candidacies) {
    await syncPresidentialSearchDocumentsForCandidacy(tx, candidacy.id);
  }

  return [...new Set(candidacies.map((candidacy) => candidacy.electionId))];
}

/**
 * Re-evaluate a candidacy and every measure whose visibility depends on its fiche gate.
 *
 * Used on publication-authority transitions. All writes share the caller's transaction, so a
 * closing fiche cannot commit while leaving an old public search document behind.
 */
export async function syncPresidentialSearchDocumentsForCandidacy(
  tx: DbTransactionClient,
  candidacyId: string
): Promise<void> {
  await syncCandidacySearchDocument(tx, candidacyId);
  const measures = await tx.measure.findMany({
    where: { candidacyId },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  await syncMeasureSearchDocuments(
    tx,
    measures.map((measure) => measure.id)
  );
}
