import type { RepereTerritoryKind } from "@/config/territoire-reperes";
import { repereMethode } from "@/config/territoire-methodes";
import { TERRITOIRES_SOURCES } from "@/config/territoires-sources";

/**
 * Indicators of "Les comptes de la collectivité" (Territoires v2, lot C, D28). Rows live in
 * `TerritoireRepere`, but the family is shown outside "Le territoire en chiffres", so its keys are
 * not in REPERE_INDICATORS. Free of server imports: the importer, the readers and the tests read
 * the same definitions.
 *
 * Each aggregate is stored twice, as two indicators: the OFGL amount per inhabitant (shown first)
 * and the total amount. The per-inhabitant figure is the producer's, never recomputed here.
 */

export type CompteAgregatKey =
  | "depenses_fonctionnement"
  | "frais_personnel"
  | "depenses_equipement"
  | "encours_dette"
  | "epargne_brute";

export interface CompteAgregat {
  key: CompteAgregatKey;
  /** Value of the `agregat` field in the OFGL datasets, exact spelling (no accent on Epargne). */
  ofglAgregat: string;
  /** Method page; its title is the label shown to readers. */
  methodSlug: string;
}

/** The five aggregates of the summary, in display order. */
export const COMPTES_AGREGATS: readonly CompteAgregat[] = [
  {
    key: "depenses_fonctionnement",
    ofglAgregat: "Dépenses de fonctionnement",
    methodSlug: "depenses-de-fonctionnement",
  },
  { key: "frais_personnel", ofglAgregat: "Frais de personnel", methodSlug: "frais-de-personnel" },
  {
    key: "depenses_equipement",
    ofglAgregat: "Dépenses d'équipement",
    methodSlug: "depenses-d-equipement",
  },
  { key: "encours_dette", ofglAgregat: "Encours de dette", methodSlug: "encours-de-dette" },
  { key: "epargne_brute", ofglAgregat: "Epargne brute", methodSlug: "epargne-brute" },
];

export type CompteMesure = "PAR_HABITANT" | "MONTANT";

export const COMPTES_UNITS: Record<CompteMesure, string> = {
  PAR_HABITANT: "€/hab",
  MONTANT: "€",
};

export const COMPTES_INDICATOR_PREFIX = "comptes_";

const MESURE_SUFFIX: Record<CompteMesure, string> = {
  PAR_HABITANT: "par_habitant",
  MONTANT: "montant",
};

export function compteIndicatorKey(agregat: CompteAgregatKey, mesure: CompteMesure): string {
  return `${COMPTES_INDICATOR_PREFIX}${agregat}_${MESURE_SUFFIX[mesure]}`;
}

/** Inverse of compteIndicatorKey; undefined for any key outside the family. */
export function parseCompteIndicatorKey(
  key: string
): { agregat: CompteAgregat; mesure: CompteMesure } | undefined {
  for (const agregat of COMPTES_AGREGATS) {
    for (const mesure of Object.keys(MESURE_SUFFIX) as CompteMesure[]) {
      if (compteIndicatorKey(agregat.key, mesure) === key) return { agregat, mesure };
    }
  }
  return undefined;
}

export function compteLabel(agregat: CompteAgregat): string {
  const m = repereMethode(agregat.methodSlug);
  if (!m) throw new Error(`Page de méthode absente : ${agregat.methodSlug}`);
  return m.title;
}

/** One OFGL consolidated dataset per scale, and its entry in the licence registry. */
export const COMPTES_DATASETS: Record<
  RepereTerritoryKind,
  { datasetId: string; sourceId: string }
> = {
  COM: { datasetId: "ofgl-base-communes-consolidee", sourceId: "ofgl-comptes-communes" },
  DEP: { datasetId: "ofgl-base-departements-consolidee", sourceId: "ofgl-comptes-departements" },
  REG: { datasetId: "ofgl-base-regions-consolidee", sourceId: "ofgl-comptes-regions" },
};

/** First exercise of the series: the communes dataset starts in 2018 (read 2026-11-21). */
export const COMPTES_PREMIER_EXERCICE = 2018;

/**
 * Last exercise shown, the same at every scale. On 2026-11-21 the communes' 2025 accounts still
 * missed 97 communes, which OFGL adds "fin décembre" with the DGFiP's final balances; 2024 got that
 * update on 2025-12-18. Raise to 2025 only after reading the December 2026 update in the
 * `historique-maj-jeux-donnees` dataset.
 */
export const COMPTES_DERNIER_EXERCICE = 2024;

/**
 * The `RepereSource` row of one scale, built from the licence registry. A source without an
 * established licence blocks the import. `methodSlug` is null: one dataset feeds five method
 * pages, and each indicator names its own.
 */
export function compteRepereSource(scale: RepereTerritoryKind) {
  const { sourceId } = COMPTES_DATASETS[scale];
  const s = TERRITOIRES_SOURCES.find((x) => x.id === sourceId);
  if (!s) throw new Error(`Source absente du registre : ${sourceId}`);
  if (!s.licence.name || !s.licence.url || !s.attribution) {
    throw new Error(`Licence ou attribution non établie pour ${sourceId} : import bloqué`);
  }
  return {
    producer: s.producer,
    resourceUrl: s.url,
    licenceName: s.licence.name,
    licenceUrl: s.licence.url,
    attribution: s.attribution,
    methodSlug: null,
  };
}
