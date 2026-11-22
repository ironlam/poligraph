import { SectionCard } from "@/components/territoires/CommuneSections";
import { LigneSource } from "@/components/territoires/LigneSource";
import { MesureBarre } from "@/components/territoires/MesureBarre";
import {
  COMPTES_AGREGATS,
  COMPTES_ATTRIBUTION_LIGNE,
  compteLabel,
} from "@/config/territoire-comptes";
import type { RepereTerritoryKind } from "@/config/territoire-reperes";
import type { CompteValeur, ComptesTerritoire } from "@/lib/data/territoire-comptes";
import {
  absenceWords,
  comptesPhrase,
  dernierExercice,
  depensesRatios,
  formatEurosParHabitant,
  formatMontant,
} from "@/lib/territoires/comptes-phrase";
import { formatDateFrUTC } from "@/lib/utils";

/**
 * "Les comptes de la collectivité" (Territoires v2, lot C, D28): a family of its own, outside
 * "Le territoire en chiffres". Server component. Euros per inhabitant first, total amount next;
 * no adjective, no ranking, no other territory, no person or party (D17, D21). The three spending
 * figures share one bar scale; the debt and the savings are written, never drawn.
 */

const DEPENSES = ["depenses_fonctionnement", "frais_personnel", "depenses_equipement"] as const;
const SOLDES = ["encours_dette", "epargne_brute"] as const;

const label = (key: string) => compteLabel(COMPTES_AGREGATS.find((a) => a.key === key)!);
const parHab = (v: CompteValeur) =>
  v.value === null ? null : `${formatEurosParHabitant(v.value)} par habitant`;

export function BudgetResume({
  comptes,
  scale,
}: {
  comptes: ComptesTerritoire;
  scale: RepereTerritoryKind;
}) {
  const y = comptes.dernierExercice;
  const phrase = comptesPhrase(comptes, scale);
  if (y === null || phrase === null) return null;

  const depenses = DEPENSES.map((key) => ({ key, entry: dernierExercice(comptes, key) }));
  const ratios = depensesRatios(depenses.map((d) => d.entry?.parHabitant.value ?? null));
  const allAbsent = depenses.every((d) => d.entry?.montant.value == null);

  return (
    <SectionCard id="comptes" title="Les comptes de la collectivité">
      <p className="text-base">{phrase}</p>
      {!allAbsent && (
        <>
          <h3 className="mt-5 mb-3 font-display text-lg font-bold">Dépenses {y}, par habitant</h3>
          <div className="space-y-4">
            {depenses.map(({ key, entry }, i) => {
              const v = entry?.parHabitant ?? null;
              const m = entry?.montant ?? null;
              return (
                <MesureBarre
                  key={key}
                  label={label(key)}
                  valeur={v?.value == null ? null : formatEurosParHabitant(v.value)}
                  ratio={ratios[i] ?? null}
                  detail={m?.value == null ? null : `${formatMontant(m.value)} au total`}
                  nonEtabli={v ? absenceWords(v) : undefined}
                />
              );
            })}
          </div>
          <dl className="mt-5 divide-y border-t">
            {SOLDES.map((key) => {
              const entry = dernierExercice(comptes, key);
              const v = entry?.parHabitant;
              const m = entry?.montant;
              return (
                // Stacked on a phone, label left and figure right from sm up.
                <div
                  key={key}
                  className="py-3 sm:flex sm:items-baseline sm:justify-between sm:gap-x-4"
                >
                  <dt className="text-sm">
                    {label(key)}
                    {key === "encours_dette" ? ` au 31 décembre ${y}` : ` ${y}`}
                  </dt>
                  <dd className="tabular-nums sm:text-right">
                    {v && m && (v.value !== null || m.value !== null) ? (
                      <>
                        {/* Per inhabitant first; without it, the total takes the first line. */}
                        <b className="font-display">
                          {parHab(v) ?? `${formatMontant(m.value as number)} au total`}
                        </b>
                        <span className="block text-xs text-muted-foreground">
                          {v.value === null
                            ? absenceWords(v)
                            : m.value !== null && `${formatMontant(m.value)} au total`}
                        </span>
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {m ? absenceWords(m) : "Non établi pour cet exercice."}
                      </span>
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
        </>
      )}
      {comptes.source && (
        <LigneSource
          className="mt-4"
          periode={`Comptes ${y}`}
          sources={[{ label: COMPTES_ATTRIBUTION_LIGNE, url: comptes.source.resourceUrl }]}
          licence={`${comptes.source.licenceName}, données lues le ${formatDateFrUTC(comptes.source.importedAt.slice(0, 10))}`}
        />
      )}
    </SectionCard>
  );
}
