import Link from "next/link";
import type { CondamnationsPartyStats } from "@/lib/data/condamnations";

/**
 * Nombre minimal d'élus suivis pour afficher un taux de condamnation. En dessous,
 * le taux n'est pas significatif (un parti à 1 élu condamné afficherait 100 %) et
 * on montre « n.s. ». Seuil d'affichage, sans impact sur les données de la requête.
 */
export const SEUIL_SUIVIS_TAUX = 10;

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
  return (
    <div>
      <div className="mb-4 rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        <span className="font-semibold text-foreground">Comment lire ce tableau.</span> «&nbsp;Élus
        suivis&nbsp;» désigne les responsables du parti présents dans notre base avec un mandat
        concerné, pas le nombre de sièges. Un parti à l{"'"}effectif plus large compte mécaniquement
        plus de condamnés en valeur absolue&nbsp;; le taux ramène ce nombre à l{"'"}effectif. Ni l
        {"'"}un ni l{"'"}autre ne suffit seul, et un taux calculé sur moins de {SEUIL_SUIVIS_TAUX}{" "}
        élus suivis n{"'"}est pas jugé significatif («&nbsp;n.s.&nbsp;»).
      </div>
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
                    {r.nSuivis >= SEUIL_SUIVIS_TAUX ? (
                      formatPct(r.tauxDefinitif)
                    ) : (
                      <span
                        className="text-muted-foreground"
                        title="Effectif trop faible pour un taux significatif"
                      >
                        n.s.
                        <span className="sr-only"> (non significatif, effectif trop faible)</span>
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-2">
                    <Link
                      href={`/affaires/condamnations?parti=${r.partySlug}&certainty=etabli${currentMandat ? `&mandat=${currentMandat}` : ""}`}
                      className="text-primary hover:underline"
                      prefetch={false}
                      aria-label={`Voir les condamnations définitives — ${r.partyName}`}
                    >
                      Voir <span aria-hidden="true">→</span>
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground mt-3">
        Parti affiché si au moins 3 élus suivis ou 1 condamnation définitive. Le taux dépend aussi
        de la visibilité médiatique, pas uniquement de la criminalité réelle.
      </p>
    </div>
  );
}
