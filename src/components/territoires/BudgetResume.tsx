import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Collapsible, SectionCard } from "@/components/territoires/CommuneSections";
import { LigneSource } from "@/components/territoires/LigneSource";
import { MesureBarre } from "@/components/territoires/MesureBarre";
import {
  COMPTES_AGREGATS,
  COMPTES_ATTRIBUTION_LIGNE,
  COMPTES_PREMIER_EXERCICE,
  compteLabel,
} from "@/config/territoire-comptes";
import type { RepereTerritoryKind } from "@/config/territoire-reperes";
import { repereMethodePath } from "@/config/territoire-methodes";
import type { CompteValeur, ComptesTerritoire } from "@/lib/data/territoire-comptes";
import {
  absenceWords,
  communeSeuleLigne,
  comptesPhrase,
  dernierExercice,
  depensesRatios,
  formatEurosParHabitant,
  formatMontant,
} from "@/lib/territoires/comptes-phrase";
import { formatDateFrUTC } from "@/lib/utils";
import { LIEN, LIEN_BLOC, SOUS_BLOC } from "@/components/territoires/classes";

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

const LINK = `inline-flex min-h-11 items-center ${LIEN}`;

export function BudgetResume({
  comptes,
  scale,
  budgetHref,
  intercommunalites = [],
}: {
  comptes: ComptesTerritoire;
  scale: RepereTerritoryKind;
  /** The territory's /budget sub-page: every exercise and one method page per aggregate. */
  budgetHref: string;
  /** Commune scale only: names of the intercommunalities it belongs to, which keep their own accounts. */
  intercommunalites?: readonly string[];
}) {
  const y = comptes.dernierExercice;
  const phrase = comptesPhrase(comptes, scale);
  if (y === null || phrase === null) return null;

  const depenses = DEPENSES.map((key) => ({ key, entry: dernierExercice(comptes, key) }));
  const ratios = depensesRatios(depenses.map((d) => d.entry?.parHabitant.value ?? null));
  const allAbsent = depenses.every((d) => d.entry?.montant.value == null);
  const seule = scale === "COM" ? communeSeuleLigne(intercommunalites) : null;

  return (
    <SectionCard
      id="comptes"
      title="Les comptes de la collectivité"
      action={
        // The answer sentence gives the operating spending: its method is one tap away.
        <Link
          href={repereMethodePath("depenses-de-fonctionnement")}
          prefetch={false}
          className={`${LINK} text-sm`}
        >
          Méthode
        </Link>
      }
    >
      <p className={`${SOUS_BLOC} text-base`}>{phrase}</p>
      {!allAbsent && (
        // The three spending figures are read without a tap; the debt and the savings are one
        // tap away.
        <div className="mt-4 space-y-4">
          <h3 className="sr-only">Dépenses {y}, par habitant</h3>
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
                  vedette={i === 0}
                />
              );
            })}
          </div>
          <Collapsible summary={`Dette et épargne ${y}`}>
            <dl className="divide-y">
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
          </Collapsible>
        </div>
      )}
      {seule && <p className="mt-4 text-sm">{seule}</p>}
      <p className="mt-2 text-sm">
        <Link href={budgetHref} prefetch={false} className={LIEN_BLOC}>
          {`Les comptes année par année, depuis ${COMPTES_PREMIER_EXERCICE}`}
          <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
        </Link>
      </p>
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
