import Link from "next/link";

interface BarData {
  label: string;
  value: number;
  maxValue?: number;
  color?: string;
  href?: string;
  suffix?: string;
}

interface HorizontalBarsProps {
  bars: BarData[];
  title: string;
  maxValue?: number;
}

export function HorizontalBars({ bars, title, maxValue: globalMax }: HorizontalBarsProps) {
  const descId = `chart-desc-${title.replace(/\s+/g, "-").toLowerCase()}`;
  const max = globalMax ?? Math.max(...bars.map((b) => b.maxValue ?? b.value), 1);

  return (
    <div role="img" aria-label={title} aria-describedby={descId}>
      <div className="space-y-3">
        {bars.map((bar) => {
          const pct = Math.min((bar.value / max) * 100, 100);
          const formattedValue = bar.value % 1 !== 0 ? bar.value.toFixed(1) : String(bar.value);

          const label = (
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium mr-2">{bar.label}</span>
              <span className="text-sm text-muted-foreground tabular-nums whitespace-nowrap">
                {formattedValue}
                {bar.suffix || ""}
              </span>
            </div>
          );

          const barEl = (
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all bg-primary/70"
                style={{
                  width: `${pct}%`,
                  ...(bar.color ? { backgroundColor: bar.color } : {}),
                }}
              />
            </div>
          );

          return bar.href ? (
            <Link
              key={bar.label}
              href={bar.href}
              prefetch={false}
              className="block hover:opacity-80"
            >
              {label}
              {barEl}
            </Link>
          ) : (
            <div key={bar.label}>
              {label}
              {barEl}
            </div>
          );
        })}
      </div>
      {/* Screen reader table */}
      <div className="sr-only">
        <table id={descId}>
          <caption>{title}</caption>
          <thead>
            <tr>
              <th>Nom</th>
              <th>Valeur</th>
            </tr>
          </thead>
          <tbody>
            {bars.map((b) => (
              <tr key={b.label}>
                <td>{b.label}</td>
                <td>
                  {b.value}
                  {b.suffix || ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
