import "server-only";
import type { CandidacyStatus, ElectionType } from "@/generated/prisma";
import { db } from "@/lib/db";
import { resolveCandidateAccentColor } from "@/lib/presidentielle/candidate-accent";
import { sortPresidentialCandidatesBySurname } from "@/lib/presidentielle/candidate-order";
import {
  resolveProgrammeAbsence,
  rollupMeasuresByCandidacy,
} from "@/lib/presidentielle/candidacy-rollup";
import { getPublicMeasuresByElection } from "./measures";
import {
  getPublicTrackedPresidentialCandidacyWhere,
  PUBLIC_TRACKED_PRESIDENTIAL_CANDIDACY_WHERE,
} from "./presidential-candidacy-policy";
import { getPublicPresidentialCandidates } from "./presidential-candidates-public";

export type PublicPresidentialElection = {
  id: string;
  slug: string;
  title: string;
  type: ElectionType;
};

export type PublicPresidentialCandidacyFieldEntry = {
  id: string;
  candidateName: string;
  politicianSlug: string;
  photoUrl: string | null;
  blobPhotoUrl: string | null;
  status: CandidacyStatus;
  sourceUrl: string;
  sourceLabel: string;
  partyLabel: string | null;
  partyColor: string | null;
  partyShortName: string | null;
  partyLogoUrl: string | null;
  /** Currently defended public measures, withdrawals excluded. */
  measureCount: number;
  themesCoveredCount: number;
  programmeAbsence: "aucun_programme" | "non_depouille" | null;
};

export type PublicPresidentialCandidacyField = {
  election: PublicPresidentialElection;
  candidacies: PublicPresidentialCandidacyFieldEntry[];
};

export async function getPublicElectionIdentity(
  electionSlug: string
): Promise<PublicPresidentialElection | null> {
  return db.election.findUnique({
    where: { slug: electionSlug },
    select: { id: true, slug: true, title: true, type: true },
  });
}

export async function hasPublicTrackedPresidentialCandidacy(
  electionId: string,
  politicianSlug: string
): Promise<boolean> {
  const candidacy = await db.candidacy.findFirst({
    where: {
      electionId,
      ...getPublicTrackedPresidentialCandidacyWhere(politicianSlug),
    },
    select: { id: true },
  });
  return candidacy !== null;
}

/**
 * Public authority for the sourced presidential tracking field.
 *
 * This population is deliberately wider than the published candidate pages: a sourced status on a
 * public politician is enough to appear, even when the presidential editorial extension is absent
 * or still DRAFT. Measure counters stay narrower and only count measures reachable from the public
 * presidential surfaces.
 */
export async function getPublicPresidentialCandidacyField(
  electionSlug: string
): Promise<PublicPresidentialCandidacyField | null> {
  const election = await getPublicElectionIdentity(electionSlug);
  if (election === null) return null;

  // The authority is presidential only. Returning the election still lets an HTTP adapter
  // distinguish an unknown slug from a known but unsupported election without reading candidacies.
  if (election.type !== "PRESIDENTIELLE") {
    return { election, candidacies: [] };
  }

  const [rows, measures, publicCandidates, editions] = await Promise.all([
    db.candidacy.findMany({
      where: {
        electionId: election.id,
        ...PUBLIC_TRACKED_PRESIDENTIAL_CANDIDACY_WHERE,
      },
      select: {
        id: true,
        candidateName: true,
        status: true,
        sourceUrl: true,
        sourceLabel: true,
        partyLabel: true,
        presidentialData: { select: { accentColor: true, publicationStatus: true } },
        politician: {
          select: {
            slug: true,
            lastName: true,
            photoUrl: true,
            blobPhotoUrl: true,
            currentParty: { select: { color: true, name: true, shortName: true } },
          },
        },
        party: { select: { color: true, name: true, shortName: true, logoUrl: true } },
      },
    }),
    getPublicMeasuresByElection(election.id),
    getPublicPresidentialCandidates(electionSlug),
    // A party edition is not a candidate programme without an explicit candidacy owner.
    db.programEdition.findMany({
      where: {
        electionId: election.id,
        publicationStatus: "PUBLISHED",
        candidacyId: { not: null },
      },
      select: { candidacyId: true },
    }),
  ]);

  const byCandidacy = rollupMeasuresByCandidacy(
    measures.map((measure) => ({
      candidacyId: measure.candidacyId,
      theme: measure.theme,
      hasPrimarySource: measure.sources.some((source) => source.tier === "PRIMARY"),
    })),
    new Set(publicCandidates.map((candidate) => candidate.id))
  );
  const editionCandidacyIds = new Set(
    editions.map((edition) => edition.candidacyId).filter((id): id is string => id !== null)
  );

  const candidacies = sortPresidentialCandidatesBySurname(rows).flatMap((candidacy) => {
    if (
      candidacy.politician === null ||
      candidacy.status === null ||
      candidacy.sourceUrl === null ||
      candidacy.sourceLabel === null
    ) {
      return [];
    }

    const rollup = byCandidacy.get(candidacy.id);
    const measureCount = rollup?.measureCount ?? 0;

    return [
      {
        id: candidacy.id,
        candidateName: candidacy.candidateName,
        politicianSlug: candidacy.politician.slug,
        photoUrl: candidacy.politician.photoUrl,
        blobPhotoUrl: candidacy.politician.blobPhotoUrl,
        status: candidacy.status,
        sourceUrl: candidacy.sourceUrl,
        sourceLabel: candidacy.sourceLabel,
        partyLabel:
          candidacy.partyLabel ?? candidacy.party?.shortName ?? candidacy.party?.name ?? null,
        partyColor: resolveCandidateAccentColor({
          accentColor:
            candidacy.presidentialData?.publicationStatus === "PUBLISHED"
              ? candidacy.presidentialData.accentColor
              : null,
          candidacyParty: candidacy.party,
          partyLabel: candidacy.partyLabel,
          currentParty: candidacy.politician.currentParty,
        }),
        partyShortName: candidacy.party?.shortName ?? null,
        partyLogoUrl: candidacy.party?.logoUrl ?? null,
        measureCount,
        themesCoveredCount: rollup?.themesCoveredCount ?? 0,
        programmeAbsence: resolveProgrammeAbsence(
          measureCount,
          editionCandidacyIds.has(candidacy.id)
        ),
      },
    ];
  });

  return { election, candidacies };
}
