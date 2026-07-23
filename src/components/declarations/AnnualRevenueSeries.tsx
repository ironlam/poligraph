import type { AnnualRevenue } from "@/types/hatvp";
import {
  sortRevenuesAsc,
  sumRevenues,
  coveredPeriod,
  formatEuroExact,
} from "@/lib/declarations/hatvp-display";

// Decorative vertical micro-bars (aria-hidden) + a visible year:amount list
// (the accessible source of truth, no hover). Heights are normalized WITHIN
// this series only — never imply cross-line comparability.
export function AnnualRevenueSeries({ revenues }: { revenues: AnnualRevenue[] }) {
  const sorted = sortRevenuesAsc(revenues);
  if (sorted.length === 0) return null;
  const max = Math.max(...sorted.map((r) => r.amount), 1);
  const total = sumRevenues(sorted);
  const period = coveredPeriod(sorted);
  return (
    <div className="mt-2">
      <div className="flex items-end gap-1" aria-hidden={true}>
        {sorted.map((r) => {
          // A real 0 collapses to no bar; non-zero gets a small floor so it
          // stays visible. Percent resolves against the fixed-height track.
          const pct = r.amount === 0 ? 0 : Math.max(8, Math.round((r.amount / max) * 100));
          return (
            <div key={r.year} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex h-10 w-full items-end justify-center">
                <div
                  className="w-full max-w-[28px] rounded-t bg-primary/70"
                  style={{ height: `${pct}%` }}
                />
              </div>
              <span className="text-[10px] text-muted-foreground">{r.year}</span>
            </div>
          );
        })}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground tabular-nums">
        {sorted.map((r) => (
          <li key={r.year}>
            <span className="font-medium text-foreground">{r.year}</span> :{" "}
            {formatEuroExact(r.amount)}
          </li>
        ))}
      </ul>
      <div className="mt-2 text-sm">
        <span className="font-semibold">Total déclaré sur la période</span>
        {period && (
          <span className="text-muted-foreground">
            {" "}
            ({period.from} → {period.to})
          </span>
        )}{" "}
        : <span className="font-semibold tabular-nums">{formatEuroExact(total)}</span>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Somme des années présentes dans la déclaration ; les hauteurs ne sont comparables qu&apos;au
        sein de cette ligne.
      </p>
    </div>
  );
}
