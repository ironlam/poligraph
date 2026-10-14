import type { GovernmentProjectGroupSummary } from "@/lib/data/government-project-positions";

interface GovernmentProjectPositionBreakdownProps {
  summary: GovernmentProjectGroupSummary;
  compact?: boolean;
}

const POSITIONS = [
  { key: "POUR", label: "Pour" },
  { key: "ABSTENTION", label: "Abstention" },
  { key: "CONTRE", label: "Contre" },
] as const;

export function GovernmentProjectPositionBreakdown({
  summary,
  compact = false,
}: GovernmentProjectPositionBreakdownProps) {
  return (
    <div>
      <div className="grid grid-cols-3 gap-2 text-center">
        {POSITIONS.map(({ key, label }) => {
          const percentage = summary.percentages[key];
          return (
            <div key={key}>
              <p className={`${compact ? "text-base" : "text-2xl"} font-bold`}>
                {percentage === null ? "-" : `${Math.round(percentage)} %`}
              </p>
              <p className="text-xs text-muted-foreground">{label}</p>
              {!compact && (
                <p className="text-xs text-muted-foreground">
                  {summary.counts[key]} scrutin{summary.counts[key] > 1 ? "s" : ""}
                </p>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        {summary.consideredCount === 0
          ? "Données indisponibles"
          : `${summary.consideredCount} scrutin${summary.consideredCount > 1 ? "s" : ""} pris en compte`}
      </p>
    </div>
  );
}
