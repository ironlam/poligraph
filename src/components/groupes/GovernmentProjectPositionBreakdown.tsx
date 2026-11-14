import type { GovernmentProjectGroupSummary } from "@/lib/data/government-project-positions";

interface GovernmentProjectPositionBreakdownProps {
  summary: GovernmentProjectGroupSummary;
  compact?: boolean;
}

const POSITIONS = [
  { key: "POUR", label: "Pour", short: "pour", color: "var(--vote-pour)" },
  {
    key: "ABSTENTION",
    label: "Abstention",
    short: "abst.",
    color: "var(--vote-abstention)",
  },
  {
    key: "CONTRE",
    label: "Contre",
    short: "contre",
    color: "var(--vote-contre)",
  },
] as const;

type PositionKey = (typeof POSITIONS)[number]["key"];

/**
 * Pour, abstention, contre side by side, in that order (the abstention sits between the two
 * sides). Decorative: the values are always written next to it.
 */
export function PositionShareBar({
  values,
  className,
}: {
  values: Record<PositionKey, number | null>;
  className?: string;
}) {
  const total = POSITIONS.reduce((sum, { key }) => sum + (values[key] ?? 0), 0);
  if (total === 0) return null;
  return (
    <span
      aria-hidden="true"
      data-testid="position-share-bar"
      className={`flex w-full gap-0.5 overflow-hidden rounded-full bg-muted ${className ?? "h-2.5"}`}
    >
      {POSITIONS.map(({ key, color }) =>
        (values[key] ?? 0) > 0 ? (
          <span
            key={key}
            style={{ width: `${((values[key] ?? 0) / total) * 100}%`, backgroundColor: color }}
          />
        ) : null
      )}
    </span>
  );
}

function formatShare(value: number | null): string {
  return value === null ? "-" : `${Math.round(value)} %`;
}

export function GovernmentProjectPositionBreakdown({
  summary,
  compact = false,
}: GovernmentProjectPositionBreakdownProps) {
  if (compact) {
    return (
      <div className="flex flex-col gap-2">
        <PositionShareBar values={summary.percentages} />
        <p className="flex justify-between gap-2 text-sm">
          {POSITIONS.map(({ key, short }) => (
            <span key={key}>
              <span className="text-base font-bold">{formatShare(summary.percentages[key])}</span>{" "}
              {short}
            </span>
          ))}
        </p>
        <p className="text-xs text-muted-foreground">
          {summary.consideredCount === 0
            ? "Données indisponibles"
            : `Sur ${summary.consideredCount} scrutin${summary.consideredCount > 1 ? "s" : ""}`}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <PositionShareBar values={summary.percentages} className="h-4" />
      <div className="grid grid-cols-3 gap-3">
        {POSITIONS.map(({ key, label }) => (
          <div key={key} className="flex flex-col">
            <span className="font-display text-3xl font-extrabold">
              {formatShare(summary.percentages[key])}
            </span>
            <span className="text-sm font-semibold">{label}</span>
            <span className="text-sm text-muted-foreground">
              {summary.counts[key] === 0
                ? "aucun scrutin"
                : `${summary.counts[key]} scrutin${summary.counts[key] > 1 ? "s" : ""}`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
