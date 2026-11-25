import Link from "next/link";
import { LigneSource } from "@/components/territoires/LigneSource";
import {
  COMPTES_AGREGATS,
  COMPTES_ATTRIBUTION_LIGNE,
  compteLabel,
} from "@/config/territoire-comptes";
import { repereMethodePath } from "@/config/territoire-methodes";
import type { CompteValeur, ComptesTerritoire } from "@/lib/data/territoire-comptes";
import {
  absenceWords,
  formatEurosParHabitant,
  formatMontant,
} from "@/lib/territoires/comptes-phrase";
import { formatDateFrUTC } from "@/lib/utils";
import { LIEN } from "@/components/territoires/classes";

/**
 * Series of "Les comptes de la collectivité", 2018 to the last exercise: one small table per
 * aggregate (exercise, per inhabitant, total), three columns that hold at 320 px. Server
 * component. A figure that is not established reads "Non établi", its reason under the table.
 */

const LINK = LIEN;

function cell(v: CompteValeur, format: (n: number) => string) {
  return v.value === null ? (
    <span className="text-muted-foreground">Non établi</span>
  ) : (
    format(v.value)
  );
}

/** "2018 à 2020 : Collectivité X" for each collectivity other than the territory itself. */
function porteurs(serie: { exercice: number; montant: CompteValeur }[]): string[] {
  const byLabel = new Map<string, number[]>();
  for (const e of serie) {
    const label = e.montant.scopeLabel;
    if (label) byLabel.set(label, [...(byLabel.get(label) ?? []), e.exercice]);
  }
  return [...byLabel].map(([label, years]) => {
    const [min, max] = [Math.min(...years), Math.max(...years)];
    return `${min === max ? min : `${min} à ${max}`} : comptes de la ${label}.`;
  });
}

type Exercice = ComptesTerritoire["agregats"][number]["serie"][number];

/**
 * Consecutive exercises carried by the same collectivity. More than one run means the perimeter
 * changes inside the table (Bas-Rhin then the Collectivité européenne d'Alsace), whatever the
 * territory: the trigger is the scope label, never a territory code.
 */
export function perimetres(
  serie: readonly Exercice[]
): { label: string | null; exercices: Exercice[] }[] {
  const runs: { label: string | null; exercices: Exercice[] }[] = [];
  for (const e of serie) {
    const label = e.montant.scopeLabel ?? e.parHabitant.scopeLabel;
    const last = runs.at(-1);
    if (last && last.label === label) last.exercices.push(e);
    else runs.push({ label, exercices: [e] });
  }
  return runs;
}

export function ComptesSerie({
  comptes,
  territoire,
}: {
  comptes: ComptesTerritoire;
  /** Name of the territory itself, heading the exercises it carries when the perimeter changes. */
  territoire: string;
}) {
  return (
    <div className="space-y-6">
      {comptes.agregats.map(({ key, serie }) => {
        const agregat = COMPTES_AGREGATS.find((a) => a.key === key)!;
        const title = compteLabel(agregat);
        const reasons = [
          ...new Set(
            serie.flatMap((e) =>
              [e.parHabitant, e.montant].filter((v) => v.value === null).map(absenceWords)
            )
          ),
        ];
        return (
          <section key={key} aria-labelledby={`serie-${key}`} className="rounded-xl border p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4">
              <h2 id={`serie-${key}`} className="font-display text-lg font-bold">
                {title}
                {key === "encours_dette" && (
                  <span className="text-sm font-normal text-muted-foreground"> au 31 décembre</span>
                )}
              </h2>
              <Link
                href={repereMethodePath(agregat.methodSlug)}
                prefetch={false}
                className={`inline-flex min-h-11 items-center text-sm ${LINK}`}
              >
                Méthode
              </Link>
            </div>
            {serie.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">Aucun exercice publié.</p>
            ) : (
              <table className="mt-2 w-full text-sm tabular-nums">
                <caption className="sr-only">{`${title}, par exercice`}</caption>
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th scope="col" className="py-2 pr-2 font-normal">
                      Exercice
                    </th>
                    <th scope="col" className="py-2 pr-2 text-right font-normal">
                      Par habitant
                    </th>
                    <th scope="col" className="py-2 text-right font-normal">
                      Montant total
                    </th>
                  </tr>
                </thead>
                {perimetres(serie).map((run, i, runs) => (
                  <tbody key={`${run.label}-${run.exercices[0]!.exercice}`}>
                    {runs.length > 1 && (
                      <tr className={i > 0 ? "border-t-2 border-foreground" : undefined}>
                        <th
                          scope="rowgroup"
                          colSpan={3}
                          className="pt-3 pb-1 text-left text-xs font-bold"
                        >
                          {run.label ?? territoire}
                        </th>
                      </tr>
                    )}
                    {run.exercices.map((e) => (
                      <tr key={e.exercice} className="border-b last:border-b-0">
                        <th scope="row" className="py-2 pr-2 text-left font-normal">
                          {e.exercice}
                        </th>
                        <td className="py-2 pr-2 text-right font-bold">
                          {cell(e.parHabitant, formatEurosParHabitant)}
                        </td>
                        <td className="py-2 text-right">{cell(e.montant, formatMontant)}</td>
                      </tr>
                    ))}
                  </tbody>
                ))}
              </table>
            )}
            {[...porteurs(serie), ...reasons].map((note) => (
              <p key={note} className="mt-2 text-xs text-muted-foreground">
                {note}
              </p>
            ))}
          </section>
        );
      })}
      {comptes.source && comptes.dernierExercice !== null && (
        <LigneSource
          periode={`Comptes ${Math.min(...comptes.agregats.flatMap((a) => a.serie.map((e) => e.exercice)))} à ${comptes.dernierExercice}`}
          sources={[{ label: COMPTES_ATTRIBUTION_LIGNE, url: comptes.source.resourceUrl }]}
          licence={`${comptes.source.licenceName}, données lues le ${formatDateFrUTC(comptes.source.importedAt.slice(0, 10))}`}
        />
      )}
    </div>
  );
}
