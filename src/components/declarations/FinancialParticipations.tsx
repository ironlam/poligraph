import type { FinancialParticipation } from "@/types/hatvp";
import { HorizontalBars } from "@/components/stats/HorizontalBars";
import { displayHatvpText, formatEuroExact } from "@/lib/declarations/hatvp-display";

const MAX_BARS = 5;

function participationName(company: string): string {
  return displayHatvpText(company) ?? "Société (nom non publié)";
}

function Line({ company, evaluation }: FinancialParticipation) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span>{participationName(company)}</span>
      <span className="tabular-nums text-muted-foreground whitespace-nowrap">
        {evaluation === null ? "Montant non renseigné" : formatEuroExact(evaluation)}
      </span>
    </div>
  );
}

// Bars only when >= 2 comparable (evaluated) values, so a single value is never
// a misleading always-full bar. Unevaluated (null) and zero are never dropped.
export function FinancialParticipations({
  participations,
}: {
  participations: FinancialParticipation[];
}) {
  if (participations.length === 0) return null;
  const evaluated = participations.filter((p) => p.evaluation !== null);
  const unevaluated = participations.filter((p) => p.evaluation === null);

  if (evaluated.length < 2) {
    return (
      <div className="space-y-2">
        {[...evaluated, ...unevaluated].map((p, i) => (
          <Line key={`p-${i}`} {...p} />
        ))}
      </div>
    );
  }

  const sorted = [...evaluated].sort((a, b) => (b.evaluation ?? 0) - (a.evaluation ?? 0));
  const top = sorted.slice(0, MAX_BARS);
  const rest = [...sorted.slice(MAX_BARS), ...unevaluated];
  const bars = top.map((p) => ({
    label: participationName(p.company),
    value: p.evaluation as number,
    suffix: " €",
  }));

  return (
    <div>
      <HorizontalBars bars={bars} title="Participations financières" />
      {rest.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm text-muted-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Voir les {participations.length} participations
          </summary>
          <div className="pt-2 space-y-2">
            {rest.map((p, i) => (
              <Line key={`rest-${i}`} {...p} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
