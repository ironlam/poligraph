import { cacheLife, cacheTag } from "next/cache";
import {
  getAllGroupConfigs,
  getAssemblyGroupOrganeRefs,
  getParliamentaryGroupConfig,
} from "@/config/parliamentaryGroups";
import { db } from "@/lib/db";
import { timelineContainsVoteRef } from "@/lib/legislation/timeline-vote-refs";
import {
  evaluateOfficialGroupPosition,
  summarizeGovernmentProjectPositions,
  validateOfficialGroupTotals,
  type GovernmentProjectPosition,
  type GovernmentProjectPositionResult,
  type GovernmentProjectPositionSummary,
} from "@/lib/scrutins/government-project-positions";
import { getGovernmentScopeExclusion, type ScopeExclusion } from "@/lib/scrutins/government-scope";

export type GovernmentProjectDataExclusion =
  | ScopeExclusion
  | "OFFICIAL_SNAPSHOT_DIAGNOSTIC"
  | "OFFICIAL_GROUPS_MISSING"
  | "OFFICIAL_GROUP_TOTALS_INCOMPLETE"
  | "OFFICIAL_GROUP_TOTALS_MISMATCH"
  | NonNullable<GovernmentProjectPositionResult["exclusion"]>;

export interface GovernmentProjectPositionRow {
  scrutin: {
    externalId: string;
    slug: string | null;
    title: string;
    votingDate: Date;
    sourceUrl: string | null;
    codeTypeVote: string | null;
    libelleTypeVote: string | null;
  };
  dossier: {
    externalId: string;
    slug: string | null;
    title: string;
    sourceUrl: string | null;
  } | null;
  position: GovernmentProjectPosition | null;
  exclusion: GovernmentProjectDataExclusion | null;
  forCount: number | null;
  againstCount: number | null;
  abstainCount: number | null;
}

export interface GovernmentProjectGroupSummary extends GovernmentProjectPositionSummary {
  candidateCount: number;
  eligibleScrutinCount: number;
  groupExcludedCount: number;
  scopeExcludedCount: number;
  updatedAt: Date | null;
}

export interface GovernmentProjectGroupData {
  summary: GovernmentProjectGroupSummary;
  rows: GovernmentProjectPositionRow[];
}

export interface GovernmentProjectPositionDataset {
  legislature: number;
  groups: Record<string, GovernmentProjectGroupData>;
}

function hasJsonDiagnostics(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  return value !== null && value !== undefined;
}

export async function getGovernmentProjectPositionDataset(
  legislature = 17
): Promise<GovernmentProjectPositionDataset> {
  "use cache";
  cacheTag("votes", "groupes");
  cacheLife("synced");

  const scrutins = await db.scrutin.findMany({
    where: {
      chamber: "AN",
      legislature,
      OR: [
        { title: { startsWith: "l'ensemble du projet", mode: "insensitive" } },
        { title: { startsWith: "l’ensemble du projet", mode: "insensitive" } },
      ],
    },
    select: {
      externalId: true,
      officialDossierRef: true,
      slug: true,
      title: true,
      votingDate: true,
      sourceUrl: true,
      codeTypeVote: true,
      libelleTypeVote: true,
      votesFor: true,
      votesAgainst: true,
      votesAbstain: true,
      officialGroupsIssues: true,
      officialGroupsSourceFetchedAt: true,
      officialGroupCounts: {
        select: {
          organeRef: true,
          forCount: true,
          againstCount: true,
          abstainCount: true,
          majorityPosition: true,
          issues: true,
        },
      },
      dossierLegislatif: {
        select: {
          externalId: true,
          slug: true,
          title: true,
          sourceUrl: true,
          origin: true,
          timeline: true,
        },
      },
    },
    orderBy: [{ votingDate: "desc" }, { externalId: "desc" }],
  });

  const officialDossierRefs = [
    ...new Set(
      scrutins
        .map((scrutin) => scrutin.officialDossierRef)
        .filter((ref): ref is string => ref !== null)
    ),
  ];
  const officialDossiers =
    officialDossierRefs.length === 0
      ? []
      : await db.legislativeDossier.findMany({
          where: { externalId: { in: officialDossierRefs } },
          select: {
            externalId: true,
            slug: true,
            title: true,
            sourceUrl: true,
            origin: true,
            timeline: true,
          },
        });
  const officialDossierByRef = new Map(
    officialDossiers.map((dossier) => [dossier.externalId, dossier])
  );

  const prepared = scrutins.map((scrutin) => {
    const hasDeclaredOfficialRef = scrutin.officialDossierRef !== null;
    const officialDossier = scrutin.officialDossierRef
      ? (officialDossierByRef.get(scrutin.officialDossierRef) ?? null)
      : null;
    const dossier = hasDeclaredOfficialRef ? officialDossier : scrutin.dossierLegislatif;
    const hasOfficialLink =
      officialDossier !== null && scrutin.officialDossierRef === officialDossier.externalId;
    const hasVoteRefLink =
      !hasDeclaredOfficialRef &&
      scrutin.dossierLegislatif !== null &&
      timelineContainsVoteRef(scrutin.dossierLegislatif.timeline, scrutin.externalId);
    const resolution = hasOfficialLink
      ? "OFFICIAL_DOSSIER_REF"
      : hasVoteRefLink
        ? "VOTE_REF"
        : dossier
          ? "TITLE_MATCH"
          : "UNMATCHED";
    const scopeExclusion = getGovernmentScopeExclusion(
      scrutin.title,
      {
        resolvedDossierExternalId: dossier?.externalId ?? null,
        resolution,
      },
      dossier?.origin
    );
    const totalsExclusion = validateOfficialGroupTotals(scrutin.officialGroupCounts, {
      votesFor: scrutin.votesFor,
      votesAgainst: scrutin.votesAgainst,
      votesAbstain: scrutin.votesAbstain,
    });
    const commonExclusion: GovernmentProjectDataExclusion | null = scopeExclusion
      ? scopeExclusion
      : hasJsonDiagnostics(scrutin.officialGroupsIssues)
        ? "OFFICIAL_SNAPSHOT_DIAGNOSTIC"
        : totalsExclusion;

    return { scrutin, dossier, commonExclusion, scopeExclusion };
  });

  const groups: Record<string, GovernmentProjectGroupData> = {};
  for (const group of getAllGroupConfigs("AN")) {
    const rows: GovernmentProjectPositionRow[] = prepared.map(
      ({ scrutin, dossier, commonExclusion }) => {
        const result = commonExclusion
          ? {
              position: null,
              exclusion: commonExclusion,
              forCount: null,
              againstCount: null,
              abstainCount: null,
            }
          : evaluateOfficialGroupPosition(
              scrutin.officialGroupCounts,
              getAssemblyGroupOrganeRefs(group.code, legislature, scrutin.votingDate)
            );
        return {
          scrutin: {
            externalId: scrutin.externalId,
            slug: scrutin.slug,
            title: scrutin.title,
            votingDate: scrutin.votingDate,
            sourceUrl: scrutin.sourceUrl,
            codeTypeVote: scrutin.codeTypeVote,
            libelleTypeVote: scrutin.libelleTypeVote,
          },
          dossier: dossier
            ? {
                externalId: dossier.externalId,
                slug: dossier.slug,
                title: dossier.title,
                sourceUrl: dossier.sourceUrl,
              }
            : null,
          position: result.position,
          exclusion: result.exclusion,
          forCount: result.forCount,
          againstCount: result.againstCount,
          abstainCount: result.abstainCount,
        };
      }
    );
    const summary = summarizeGovernmentProjectPositions(
      rows.map((row) => ({
        position: row.position,
        exclusion:
          row.exclusion === null ||
          [
            "GROUP_REFERENCE_MISSING",
            "GROUP_SNAPSHOT_MISSING",
            "GROUP_SNAPSHOT_AMBIGUOUS",
            "SOURCE_DIAGNOSTIC",
            "COUNTS_INCOMPLETE",
            "POSITION_TIE",
            "MAJORITY_MISMATCH",
          ].includes(row.exclusion)
            ? (row.exclusion as GovernmentProjectPositionResult["exclusion"])
            : "SOURCE_DIAGNOSTIC",
        forCount: row.forCount,
        againstCount: row.againstCount,
        abstainCount: row.abstainCount,
      }))
    );
    const eligibleScrutinCount = prepared.filter(({ scopeExclusion }) => !scopeExclusion).length;
    const sourceDates = prepared
      .map(({ scrutin }) => scrutin.officialGroupsSourceFetchedAt)
      .filter((date): date is Date => date !== null);
    groups[group.code] = {
      rows,
      summary: {
        ...summary,
        candidateCount: rows.length,
        eligibleScrutinCount,
        groupExcludedCount: Math.max(0, eligibleScrutinCount - summary.consideredCount),
        scopeExcludedCount: rows.length - eligibleScrutinCount,
        updatedAt:
          sourceDates.length === 0
            ? null
            : new Date(Math.max(...sourceDates.map((date) => date.getTime()))),
      },
    };
  }

  return { legislature, groups };
}

export async function getGovernmentProjectPositionsForGroup(
  groupCode: string,
  legislature = 17
): Promise<GovernmentProjectGroupData | null> {
  const dataset = await getGovernmentProjectPositionDataset(legislature);
  const canonicalCode = getParliamentaryGroupConfig(groupCode, "AN")?.code ?? groupCode;
  return dataset.groups[canonicalCode] ?? null;
}
