import Link from "next/link";
import type { CondamnationsPartyStats } from "@/lib/data/condamnations";

function formatPct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

export function CondamnationsStatsTable({
  rows,
  currentMandat,
}: {
  rows: CondamnationsPartyStats[];
  currentMandat?: string;
}) {
  const maxTaux = Math.max(...rows.map((r) => r.tauxDefinitif), 0.01);

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm" aria-describedby="stats-caption">
        <caption id="stats-caption" className="sr-only">
          Nombre et taux de responsables politiques condamnés définitivement par parti
          {currentMandat ? `, filtré sur le mandat ${currentMandat}` : ""}.
        </caption>
        <thead>
          <tr className="border-b-2 border-border">
            <th scope="col" className="text-left py-3 px-2 font-semibold">
              Parti
            </th>
            <th scope="col" className="text-right py-3 px-2 font-semibold tabular-nums">
              Élus suivis
            </th>
            <th scope="col" className="text-right py-3 px-2 font-semibold tabular-nums">
              Condamnés définitifs
            </th>
            <th scope="col" className="text-right py-3 px-2 font-semibold tabular-nums">
              Taux
            </th>
            <th scope="col" className="text-left py-3 px-2 font-semibold">
              Détails
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const bar = (r.tauxDefinitif / maxTaux) * 100;
            return (
              <tr key={r.partyId} className="border-b border-border hover:bg-muted/30">
                <th scope="row" className="text-left py-3 px-2 font-medium">
                  <Link
                    href={`/partis/${r.partySlug}`}
                    className="hover:underline"
                    prefetch={false}
                  >
                    {r.partyName}
                    <span className="text-muted-foreground ml-1">({r.partyShortName})</span>
                  </Link>
                </th>
                <td className="text-right py-3 px-2 tabular-nums">{r.nSuivis}</td>
                <td className="text-right py-3 px-2 tabular-nums">{r.nCondamnesDefinitifs}</td>
                <td className="text-right py-3 px-2 tabular-nums">
                  <div className="flex items-center justify-end gap-2">
                    <span>{formatPct(r.tauxDefinitif)}</span>
                    <svg
                      width="60"
                      height="8"
                      viewBox="0 0 60 8"
                      aria-hidden="true"
                      className="shrink-0"
                    >
                      <rect width="60" height="8" fill="currentColor" opacity="0.1" />
                      <rect width={bar * 0.6} height="8" fill="currentColor" opacity="0.7" />
                    </svg>
                  </div>
                </td>
                <td className="py-3 px-2">
                  <Link
                    href={`/affaires/condamnations?parti=${r.partySlug}&certainty=etabli${currentMandat ? `&mandat=${currentMandat}` : ""}`}
                    className="text-primary hover:underline"
                    prefetch={false}
                  >
                    Voir →
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-xs text-muted-foreground mt-3">
        Parti affiché si au moins 3 élus suivis ou 1 condamnation définitive. Le taux dépend aussi
        de la visibilité médiatique, pas uniquement de la criminalité réelle.
      </p>
    </div>
  );
}
