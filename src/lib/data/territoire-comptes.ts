import { cacheLife, cacheTag } from "next/cache";
import {
  COMPTES_AGREGATS,
  COMPTES_DATASETS,
  compteRepereSource,
  parseCompteIndicatorKey,
  type CompteAgregatKey,
} from "@/config/territoire-comptes";
import { db } from "@/lib/db";
import { isMissingTableError } from "@/lib/data/commune-population";
import type { RepereTerritoryKind } from "@/config/territoire-reperes";
import {
  getTerritoireComptesRows,
  type RepereRow,
  type RepereSourceRef,
  type RepereState,
} from "@/lib/data/territoire-reperes";

/**
 * "Les comptes de la collectivité" of one territory (Territoires v2, lot C), shaped for the page:
 * per aggregate, one entry per exercise with the amount per inhabitant and the total amount.
 * The signature takes a single code: no comparison between territories is possible from here.
 * Nothing in this file reads an elected official or a party.
 */

export interface CompteValeur {
  /** Null unless the state establishes a figure. Never a zero for a missing figure. */
  value: number | null;
  state: RepereState;
  reason: string | null;
  /** Name of the collectivity when it is not the territory itself (Ville de Paris, CEA). */
  scopeLabel: string | null;
}

export interface CompteExercice {
  exercice: number;
  parHabitant: CompteValeur;
  montant: CompteValeur;
}

export interface ComptesTerritoire {
  /** Most recent exercise with a published row, null while nothing is published. */
  dernierExercice: number | null;
  /** The five aggregates in display order, each series most recent first. */
  agregats: { key: CompteAgregatKey; serie: CompteExercice[] }[];
  /** One source per scale; null while nothing is published. */
  source: RepereSourceRef | null;
}

const MISSING: CompteValeur = {
  value: null,
  state: "NON_ETABLI",
  reason: null,
  scopeLabel: null,
};

const valeur = (r: RepereRow): CompteValeur => ({
  value: r.value,
  state: r.state,
  reason: r.reason,
  scopeLabel: r.scopeLabel,
});

/** Pure: published rows of one territory to the shape the page reads. */
export function groupComptes(rows: readonly RepereRow[]): ComptesTerritoire {
  const byKey = new Map<CompteAgregatKey, Map<number, CompteExercice>>();
  let dernier: number | null = null;
  for (const r of rows) {
    const parsed = parseCompteIndicatorKey(r.indicatorKey);
    if (!parsed) continue;
    const exercice = Number(r.periodEnd.slice(0, 4));
    dernier = dernier === null ? exercice : Math.max(dernier, exercice);
    const serie = byKey.get(parsed.agregat.key) ?? new Map<number, CompteExercice>();
    const entry = serie.get(exercice) ?? { exercice, parHabitant: MISSING, montant: MISSING };
    if (parsed.mesure === "PAR_HABITANT") entry.parHabitant = valeur(r);
    else entry.montant = valeur(r);
    serie.set(exercice, entry);
    byKey.set(parsed.agregat.key, serie);
  }
  return {
    dernierExercice: dernier,
    agregats: COMPTES_AGREGATS.map((a) => ({
      key: a.key,
      serie: [...(byKey.get(a.key)?.values() ?? [])].sort((x, y) => y.exercice - x.exercice),
    })),
    source: rows[0]?.source ?? null,
  };
}

export async function getComptesTerritoire(
  type: RepereTerritoryKind,
  code: string
): Promise<ComptesTerritoire> {
  return groupComptes(await getTerritoireComptesRows(type, code));
}

/**
 * Scales whose accounts batch is published. A /budget sub-page answers 404 until then, so a link
 * to it (from the « échelle des territoires ») is drawn only for these scales. One bounded query,
 * cached like the accounts themselves: a publication shows within the 24 h profile.
 */
export async function getEchellesComptesPubliees(): Promise<RepereTerritoryKind[]> {
  "use cache";
  cacheTag("territoires", "comptes:echelles");
  cacheLife("synced");
  const scales = Object.keys(COMPTES_DATASETS) as RepereTerritoryKind[];
  const byUrl = new Map(scales.map((s) => [compteRepereSource(s).resourceUrl, s]));
  try {
    const published = await db.repereImport.findMany({
      where: { status: "PUBLISHED", source: { resourceUrl: { in: [...byUrl.keys()] } } },
      select: { source: { select: { resourceUrl: true } } },
      take: 50,
    });
    return scales.filter((s) => published.some((p) => byUrl.get(p.source.resourceUrl) === s));
  } catch (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }
}
