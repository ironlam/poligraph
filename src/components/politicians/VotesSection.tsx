import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CiteAnchor } from "@/components/ui/CiteAnchor";
import { scrutinPermalink } from "@/lib/cite";
import { VOTE_POSITION_DOT_COLORS } from "@/config/labels";
import { VotePositionBadge, ParliamentaryCard } from "@/components/votes";
import {
  toPublicTitleView,
  displayTitleOf,
  type PolicyForView,
} from "@/lib/votes/to-public-title-view";
import type { VotingResult } from "@/generated/prisma";
import type { PoliticianVotingStats } from "@/services/voteStats";
import type { PoliticianParliamentaryCardData } from "@/services/voteStats";
import type { PoliticianThemeDistribution } from "@/services/voteStats";
import type { VotePosition } from "@/types";
import { ThemeDistributionChart } from "./ThemeDistributionChart";

interface VotesSectionProps {
  slug: string;
  voteData: {
    stats: PoliticianVotingStats;
    recentVotes: {
      id: string;
      position: VotePosition;
      scrutin: {
        id: string;
        title: string;
        votingDate: Date | null;
        result: string | null;
        policyTitle: PolicyForView | null;
      };
    }[];
  };
  parliamentaryCard: PoliticianParliamentaryCardData | null;
  currentMandate: {
    type: string;
    title: string;
    constituency: string | null;
  } | null;
  currentGroup: {
    code: string;
    name: string;
    color: string | null;
  } | null;
  isChamberPresident?: boolean;
  themeDistribution?: PoliticianThemeDistribution[];
}

export function VotesSection({
  slug,
  voteData,
  parliamentaryCard,
  currentMandate,
  currentGroup,
  isChamberPresident,
  themeDistribution,
}: VotesSectionProps) {
  return (
    <div className="space-y-8">
      {/* Parliamentary mandate card */}
      {parliamentaryCard && currentMandate && (
        <ParliamentaryCard
          data={parliamentaryCard}
          groupCode={currentGroup?.code ?? null}
          groupName={currentGroup?.name ?? null}
          groupColor={currentGroup?.color ?? null}
          constituency={currentMandate.constituency ?? null}
          mandateTitle={currentMandate.title}
          isChamberPresident={isChamberPresident}
        />
      )}

      {/* Votes */}
      {voteData.stats.total > 0 && (
        <Card id="votes">
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="leading-none font-semibold">Votes parlementaires</h2>
              <Link
                href={`/politiques/${slug}/votes`}
                prefetch={false}
                className="text-sm text-primary hover:underline"
              >
                Voir tout →
              </Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Stats summary */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-center">
              <div className="p-2 bg-green-50 rounded-lg">
                <p className="text-lg font-bold text-green-600">{voteData.stats.pour}</p>
                <p className="text-xs text-muted-foreground">Pour</p>
              </div>
              <div className="p-2 bg-red-50 rounded-lg">
                <p className="text-lg font-bold text-red-600">{voteData.stats.contre}</p>
                <p className="text-xs text-muted-foreground">Contre</p>
              </div>
              <div className="p-2 bg-yellow-50 rounded-lg">
                <p className="text-lg font-bold text-yellow-600">{voteData.stats.abstention}</p>
                <p className="text-xs text-muted-foreground">Abstention</p>
              </div>
              <div className="p-2 bg-slate-50 rounded-lg">
                <p className="text-lg font-bold text-slate-600">{voteData.stats.nonVotant}</p>
                <p className="text-xs text-muted-foreground">Non-votant</p>
              </div>
              <div className="p-2 bg-gray-50 rounded-lg">
                <p className="text-lg font-bold text-gray-600">{voteData.stats.absent}</p>
                <p className="text-xs text-muted-foreground">Absent</p>
              </div>
            </div>

            {/* Participation bar (hidden for chamber presidents) */}
            {!isChamberPresident && (
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span id="participation-label" className="text-muted-foreground">
                    Participation
                  </span>
                  <span className="font-medium">{voteData.stats.participationRate}%</span>
                </div>
                <div
                  className="h-2 bg-gray-100 rounded-full overflow-hidden"
                  role="progressbar"
                  aria-labelledby="participation-label"
                  aria-valuenow={voteData.stats.participationRate}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className="h-full bg-primary"
                    style={{ width: `${voteData.stats.participationRate}%` }}
                  />
                </div>
              </div>
            )}

            {/* Dissidence bar (only if group data available) */}
            {!isChamberPresident && parliamentaryCard?.dissidenceRate != null && (
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span id="dissidence-label" className="text-muted-foreground">
                    Taux de dissidence
                  </span>
                  <span className="font-medium">{parliamentaryCard.dissidenceRate}%</span>
                </div>
                <div
                  className="h-2 bg-gray-100 rounded-full overflow-hidden"
                  role="progressbar"
                  aria-labelledby="dissidence-label"
                  aria-valuenow={parliamentaryCard.dissidenceRate}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className="h-full bg-amber-500"
                    style={{ width: `${Math.min(parliamentaryCard.dissidenceRate, 100)}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {parliamentaryCard.dissidenceCount} vote
                  {(parliamentaryCard.dissidenceCount ?? 0) > 1 ? "s" : ""} contre la majorité du
                  groupe sur {parliamentaryCard.dissidenceTotal}
                </p>
              </div>
            )}

            {/* Recent votes */}
            {voteData.recentVotes.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">Derniers votes</p>
                <div className="space-y-2">
                  {voteData.recentVotes.map((vote) => {
                    // Public title: policy iff APPROVED + valid, else official (no leak).
                    const view = toPublicTitleView({
                      title: vote.scrutin.title,
                      votingDate: vote.scrutin.votingDate ?? new Date(0),
                      result: (vote.scrutin.result as VotingResult) ?? "ADOPTED",
                      chamber: "AN",
                      sourceUrl: null,
                      policyTitle: vote.scrutin.policyTitle,
                    });
                    return (
                      <div key={vote.id} className="group flex items-start gap-2 text-sm">
                        <span
                          className={`w-2 h-2 mt-1.5 shrink-0 rounded-full ${VOTE_POSITION_DOT_COLORS[vote.position]}`}
                        />
                        <Link
                          href={`/parlement/votes/${vote.scrutin.id}`}
                          prefetch={false}
                          className="flex-1 hover:underline"
                        >
                          {displayTitleOf(view)}
                          {view.mode === "policy" && (
                            <Badge
                              variant="accent"
                              className="ml-1.5 align-middle text-[10px] font-medium"
                            >
                              Titre explicatif
                            </Badge>
                          )}
                        </Link>
                        <VotePositionBadge position={vote.position} size="sm" />
                        <CiteAnchor permalink={scrutinPermalink(vote.scrutin.id)} label="ce vote" />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Theme distribution */}
      {themeDistribution && themeDistribution.length > 0 && (
        <ThemeDistributionChart themes={themeDistribution} />
      )}
    </div>
  );
}
