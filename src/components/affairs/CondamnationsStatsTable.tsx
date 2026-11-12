import Link from "next/link";
import type { CondamnationsPartyStats } from "@/lib/data/condamnations";

/**
 * Nombre minimal de responsables suivis pour afficher un taux de condamnation. En dessous,
 * le taux n'est pas significatif (un parti à 1 élu condamné afficherait 100 %) et
 * on montre « n.s. ». Seuil d'affichage, sans impact sur les données de la requête.
 */
export const SEUIL_SUIVIS_TAUX = 10;

const PERCENT = new Intl.NumberFormat("fr-FR", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function formatPct(v: number): string {
  return PERCENT.format(v);
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
      <div className="mb-4 space-y-3 rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        <p className="font-semibold text-foreground">Comment lire ce tableau.</p>
        {/* The division is shown, not described: the denominator is what readers get wrong. */}
        <p className="flex flex-wrap items-center gap-2 text-foreground">
          <span className="rounded-md border border-border bg-background px-3 py-2">
            Condamnés définitifs du parti
          </span>
          <span aria-hidden="true" className="font-display text-2xl font-extrabold">
            ÷
          </span>
          <span className="sr-only">divisé par</span>
          <span className="rounded-md border border-primary bg-background px-3 py-2 font-semibold">
            Responsables politiques du parti enregistrés dans la base Poligraph
          </span>
        </p>
        <p>
          «&nbsp;Responsables suivis&nbsp;» désigne les personnes rattachées aujourd{"'"}hui à ce
          parti dans notre base, avec un mandat concerné. Ce n{"'"}est ni le nombre de sièges, ni le
          nombre d{"'"}adhérents. Un parti à l{"'"}effectif plus large compte mécaniquement plus de
          condamnés en valeur absolue&nbsp;; le taux ramène ce nombre à l{"'"}effectif. Ni l{"'"}un
          ni l{"'"}autre ne suffit seul, et un taux calculé sur moins de {SEUIL_SUIVIS_TAUX}{" "}
          responsables suivis n{"'"}est pas jugé significatif («&nbsp;n.s.&nbsp;»).
        </p>
        {/* Both sides of the division count the same people, the party's members today. Counting
            convictions under the party held at the time of the facts would divide two different
            populations, so the limit of the choice is stated rather than hidden. */}
        <p>
          Une condamnation est comptée dans le parti actuel de la personne. Il peut différer du
          parti auquel elle appartenait au moment des faits, indiqué sur la fiche de chaque affaire.
        </p>
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
              <th
                scope="col"
                className="hidden text-right py-3 px-2 font-semibold tabular-nums md:table-cell"
              >
                Responsables suivis
              </th>
              <th
                scope="col"
                className="hidden text-right py-3 px-2 font-semibold tabular-nums md:table-cell"
              >
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
                    {/* Below md the two count columns are hidden: the sentence carries them,
                        with the denominator spelled out on every row. */}
                    <span className="mt-1 block font-normal text-muted-foreground md:hidden">
                      {r.nCondamnesDefinitifs.toLocaleString("fr-FR")} condamné
                      {r.nCondamnesDefinitifs > 1 ? "s" : ""} définitif
                      {r.nCondamnesDefinitifs > 1 ? "s" : ""} sur{" "}
                      {r.nSuivis.toLocaleString("fr-FR")} responsable{r.nSuivis > 1 ? "s" : ""}{" "}
                      suivi{r.nSuivis > 1 ? "s" : ""}
                    </span>
                  </th>
                  <td className="hidden text-right py-3 px-2 tabular-nums md:table-cell">
                    {r.nSuivis.toLocaleString("fr-FR")}
                  </td>
                  <td className="hidden text-right py-3 px-2 tabular-nums md:table-cell">
                    {r.nCondamnesDefinitifs.toLocaleString("fr-FR")}
                  </td>
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
                      className="inline-flex min-h-11 items-center text-primary hover:underline"
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
        Partis classés par nombre de responsables suivis, du plus grand effectif au plus petit.
        Parti affiché si au moins 3 responsables suivis ou 1 condamnation définitive. Le taux dépend
        aussi de la visibilité médiatique, pas uniquement de la criminalité réelle.
      </p>
    </div>
  );
}
