import { Card, CardContent } from "@/components/ui/card";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Info } from "lucide-react";
import type { PoliticianParliamentaryCardData } from "@/services/voteStats";

interface ParliamentaryCardProps {
  data: PoliticianParliamentaryCardData;
  groupCode: string | null;
  groupName: string | null;
  groupColor: string | null;
  constituency: string | null;
  mandateTitle: string;
  isChamberPresident?: boolean;
}

/**
 * Semicircular SVG gauge for participation rate.
 * Arc spans 180° from left to right, filled proportionally.
 */
function ParticipationGauge({ rate }: { rate: number }) {
  const radius = 54;
  const strokeWidth = 10;
  const cx = 64;
  const cy = 62;

  // Arc from π (left) to 0 (right)
  const circumference = Math.PI * radius;
  const filled = (rate / 100) * circumference;

  // Color based on rate
  const color = rate >= 75 ? "text-emerald-500" : rate >= 50 ? "text-amber-500" : "text-red-500";

  // Semantic label for accessibility
  const label = rate >= 75 ? "Bonne" : rate >= 50 ? "Moyenne" : "Faible";

  return (
    <div className="relative w-32 h-[70px]" role="img" aria-label={`Participation : ${rate}%`}>
      <svg viewBox="0 0 128 70" className="w-full h-full" aria-hidden="true">
        {/* Background arc */}
        <path
          d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          className="text-muted/40"
        />
        {/* Filled arc */}
        <path
          d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference}`}
          className={color}
        />
      </svg>
      {/* Center text */}
      <div className="absolute inset-0 flex flex-col items-center justify-end pb-0.5">
        <span className={`text-2xl font-bold tabular-nums leading-none ${color}`}>
          {rate.toFixed(0)}
          <span className="text-base">%</span>
        </span>
        <span className="text-[10px] text-muted-foreground mt-0.5">{label}</span>
      </div>
    </div>
  );
}

export function ParliamentaryCard({
  data,
  groupCode,
  groupName,
  groupColor,
  constituency,
  mandateTitle,
  isChamberPresident,
}: ParliamentaryCardProps) {
  const publishedParticipationRate =
    data.participationStatus === "AVAILABLE" ? data.participationRate : null;
  const chamberLabel = data.chamber === "AN" ? "Assemblée nationale" : "Sénat";
  const chamberColor =
    data.chamber === "AN"
      ? "from-blue-600/10 to-blue-600/5 dark:from-blue-500/15 dark:to-blue-500/5"
      : "from-rose-600/10 to-rose-600/5 dark:from-rose-500/15 dark:to-rose-500/5";
  const chamberAccent =
    data.chamber === "AN" ? "bg-blue-600 dark:bg-blue-500" : "bg-rose-600 dark:bg-rose-500";

  return (
    <Card className="overflow-hidden" id="mandat">
      {/* Chamber header strip */}
      <div className={`bg-gradient-to-r ${chamberColor} px-5 py-3 border-b`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className={`w-2 h-2 rounded-full ${chamberAccent}`} />
            <span className="text-sm font-semibold">{chamberLabel}</span>
          </div>
          {groupCode && (
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
              style={{
                backgroundColor: groupColor ? `${groupColor}20` : "hsl(var(--muted))",
                color: groupColor || "hsl(var(--muted-foreground))",
                borderWidth: 1,
                borderColor: groupColor ? `${groupColor}40` : "hsl(var(--border))",
              }}
              title={groupName || undefined}
            >
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ backgroundColor: groupColor || "hsl(var(--muted-foreground))" }}
              />
              {groupCode}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-1">{mandateTitle}</p>
        {constituency && <p className="text-xs text-muted-foreground">{constituency}</p>}
      </div>

      <CardContent className="pt-5 pb-4">
        {publishedParticipationRate === null ? (
          <div className="flex items-start gap-3 p-3 bg-muted rounded-lg">
            <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" aria-hidden="true" />
            <div className="text-sm text-muted-foreground">
              {data.participationStatus === "SOURCE_INSUFFICIENT" ? (
                <p>
                  Le Sénat ne publie pas actuellement une donnée permettant de mesurer la présence
                  individuelle de façon suffisamment fiable.
                </p>
              ) : (
                <p>
                  Le périmètre nécessaire au calcul de la participation n&apos;est pas disponible.
                </p>
              )}
              <p className="mt-1 text-xs">
                {data.votesCount.toLocaleString("fr-FR")} votes enregistrés restent consultables.
              </p>
            </div>
          </div>
        ) : isChamberPresident ? (
          <div className="flex items-start gap-3 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg">
            <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" aria-hidden="true" />
            <div className="text-sm text-muted-foreground">
              <p>
                Par convention, le président de chambre ne participe pas aux scrutins afin de
                garantir l&apos;impartialité de la présidence.
              </p>
              <p className="mt-1 text-xs">
                Les statistiques de participation ne sont pas affichées.
              </p>
            </div>
          </div>
        ) : (
          /* Main layout: gauge + stats */
          <div className="flex items-start gap-5">
            {/* Gauge */}
            <div className="flex flex-col items-center shrink-0">
              <ParticipationGauge rate={publishedParticipationRate} />
              <span className="text-[10px] text-muted-foreground mt-1 flex items-center gap-0.5">
                Participation <InfoTooltip term="participationRate" size="sm" />
              </span>
            </div>

            {/* Stats grid */}
            <div className="flex-1 space-y-3 min-w-0">
              {/* Votes fraction */}
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-muted-foreground">Votes exprimés</span>
                  <span className="font-medium tabular-nums">
                    {data.votesCount.toLocaleString("fr-FR")} /{" "}
                    {data.eligibleScrutins?.toLocaleString("fr-FR")}
                  </span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      publishedParticipationRate >= 75
                        ? "bg-emerald-500"
                        : publishedParticipationRate >= 50
                          ? "bg-amber-500"
                          : "bg-red-500"
                    }`}
                    style={{
                      width: `${Math.min(publishedParticipationRate, 100)}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
