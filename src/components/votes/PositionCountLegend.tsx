import { cn } from "@/lib/utils";

/**
 * The counts of one group, written out: a colour dot, the label, then the figure in bold.
 *
 * The dot is decorative and the label is always written, so nothing is carried by the colour
 * alone. A zero is dimmed, which lets the eye land on the positions the group actually took.
 * The non-voters carry a hollow dot: they are not an expressed vote and have no segment in
 * `PositionCountBar`. `null` means the source does not publish them, and the entry is left out.
 */
interface PositionCountLegendProps {
  forCount: number;
  againstCount: number;
  abstainCount: number;
  nonVoterCount: number | null;
  className?: string;
}

export function PositionCountLegend({
  forCount,
  againstCount,
  abstainCount,
  nonVoterCount,
  className,
}: PositionCountLegendProps) {
  const entries: { key: string; label: string; count: number | null; color: string | null }[] = [
    { key: "pour", label: "Pour", count: forCount, color: "var(--vote-pour)" },
    { key: "contre", label: "Contre", count: againstCount, color: "var(--vote-contre)" },
    {
      key: "abstention",
      label: "Abstentions",
      count: abstainCount,
      color: "var(--vote-abstention)",
    },
    { key: "non-votants", label: "Non-votants", count: nonVoterCount, color: null },
  ];
  return (
    <ul className={cn("flex flex-wrap gap-x-4 gap-y-1 text-sm", className)}>
      {entries.map((entry) =>
        entry.count === null ? null : (
          <li
            key={entry.key}
            data-count={entry.key}
            className="inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <span
              aria-hidden="true"
              className={cn(
                "h-2.5 w-2.5 shrink-0 rounded-full",
                entry.color === null && "border border-muted-foreground",
                entry.count === 0 && "opacity-40"
              )}
              style={entry.color ? { backgroundColor: entry.color } : undefined}
            />
            <span className="text-muted-foreground">{entry.label}</span>
            <span
              className={cn(
                "tabular-nums",
                entry.count === 0 ? "text-muted-foreground" : "font-semibold text-foreground"
              )}
            >
              {entry.count}
            </span>
          </li>
        )
      )}
    </ul>
  );
}
