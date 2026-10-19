"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { VOTE_POSITION_DOT_COLORS } from "@/config/labels";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { formatDate } from "@/lib/utils";
import type { MandatePeriod, PerimeterIssue } from "@/lib/votes/legislature-perimeter";

/** Why no participation rate is shown for a legislature, in words a citizen can act on. */
const PERIMETER_ISSUE_COPY: Record<PerimeterIssue, string> = {
  NO_MANDATE:
    "Aucun mandat de député couvrant des scrutins de cette législature n\u2019est documenté : le taux de participation n\u2019est pas calculé.",
  OVERLAPPING_MANDATES:
    "Des mandats de député se chevauchent pendant cette législature : le taux de participation n\u2019est pas calculé.",
  VOTES_OUTSIDE_MANDATE:
    "Des votes sont enregistrés en dehors des dates de mandat connues : le taux de participation n\u2019est pas calculé.",
};

interface VoteStatsProps {
  stats: {
    total: number;
    pour: number;
    contre: number;
    abstention: number;
    nonVotant?: number;
    eligibleScrutins: number | null;
    scrutinsSansVoteEnregistre: number | null;
    participationRate: number | null;
    participationStatus: "AVAILABLE" | "SOURCE_INSUFFICIENT" | "COMPUTATION_INCOMPLETE";
  };
  isChamberPresident?: boolean;
  /** Set when the figures cover one legislature rather than the whole career. */
  scope?: {
    label: string;
    issue: PerimeterIssue | null;
    periods: MandatePeriod[];
  };
}

export function VoteStats({ stats, isChamberPresident, scope }: VoteStatsProps) {
  const { total, pour, contre, abstention, nonVotant = 0, participationRate } = stats;
  const participationAvailable =
    stats.participationStatus === "AVAILABLE" && participationRate !== null;

  const expressed = pour + contre + abstention;
  const pourPercent = expressed > 0 ? (pour / expressed) * 100 : 0;
  const contrePercent = expressed > 0 ? (contre / expressed) * 100 : 0;
  const abstentionPercent = expressed > 0 ? (abstention / expressed) * 100 : 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Statistiques de vote</CardTitle>
        {scope && (
          <p className="text-sm text-muted-foreground">
            {scope.label}, tous types de scrutin confondus
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Participation (hidden for chamber presidents) */}
        {!isChamberPresident && participationAvailable && (
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-muted-foreground flex items-center gap-1">
                Participation <InfoTooltip term="participationRate" />
              </span>
              <span className="font-medium">{participationRate}%</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all"
                style={{ width: `${participationRate}%` }}
              />
            </div>
          </div>
        )}
        {stats.participationStatus === "SOURCE_INSUFFICIENT" && (
          <p className="text-sm text-muted-foreground">
            Le Sénat ne publie pas actuellement une donnée permettant de mesurer la présence
            individuelle de façon suffisamment fiable.
          </p>
        )}
        {!isChamberPresident &&
          scope &&
          participationAvailable &&
          stats.eligibleScrutins != null && (
            <p className="text-sm text-muted-foreground">
              Position exprimée sur {expressed.toLocaleString("fr-FR")} des{" "}
              {stats.eligibleScrutins.toLocaleString("fr-FR")} scrutins tenus{" "}
              {scope.periods
                .map((p) => `du ${formatDate(p.start)} au ${formatDate(p.end)}`)
                .join(", puis ")}
              , pendant le mandat de député. Un scrutin sans position enregistrée n&apos;est pas
              forcément une absence : la source ne permet pas de le distinguer d&apos;une donnée
              manquante.
            </p>
          )}
        {stats.participationStatus === "COMPUTATION_INCOMPLETE" && (
          <p className="text-sm text-muted-foreground">
            {scope?.issue
              ? PERIMETER_ISSUE_COPY[scope.issue]
              : "Le périmètre nécessaire au calcul de la participation n\u2019est pas disponible."}
          </p>
        )}

        {/* Distribution des votes */}
        {total > 0 ? (
          <div>
            <p className="text-sm text-muted-foreground mb-2">
              Répartition des votes ({expressed} exprimés sur {total})
            </p>
            <div className="flex h-3 rounded-full overflow-hidden bg-gray-100">
              <div
                className={VOTE_POSITION_DOT_COLORS.POUR}
                style={{ width: `${pourPercent}%` }}
                title={`Pour: ${pour}`}
              />
              <div
                className={VOTE_POSITION_DOT_COLORS.CONTRE}
                style={{ width: `${contrePercent}%` }}
                title={`Contre: ${contre}`}
              />
              <div
                className={VOTE_POSITION_DOT_COLORS.ABSTENTION}
                style={{ width: `${abstentionPercent}%` }}
                title={`Abstention: ${abstention}`}
              />
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Aucun vote enregistré</p>
        )}

        {/* Détails */}
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${VOTE_POSITION_DOT_COLORS.POUR}`} />
            <span className="text-muted-foreground">Pour</span>
            <span className="ml-auto font-medium">{pour}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${VOTE_POSITION_DOT_COLORS.CONTRE}`} />
            <span className="text-muted-foreground">Contre</span>
            <span className="ml-auto font-medium">{contre}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${VOTE_POSITION_DOT_COLORS.ABSTENTION}`} />
            <span className="text-muted-foreground">Abstention</span>
            <InfoTooltip term="abstention" />
            <span className="ml-auto font-medium">{abstention}</span>
          </div>
          {nonVotant > 0 && (
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${VOTE_POSITION_DOT_COLORS.NON_VOTANT}`} />
              <span className="text-muted-foreground">Non-votant</span>
              <InfoTooltip term="nonVotant" />
              <span className="ml-auto font-medium">{nonVotant}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
