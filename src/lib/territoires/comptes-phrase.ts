import {
  COMPTES_ABSENCE_WORDS,
  type CompteAbsenceReason,
  type CompteAgregatKey,
} from "@/config/territoire-comptes";
import type { RepereTerritoryKind } from "@/config/territoire-reperes";
import type {
  CompteExercice,
  CompteValeur,
  ComptesTerritoire,
} from "@/lib/data/territoire-comptes";

/**
 * Words of "Les comptes de la collectivité". Pure and tested: the answer sentence comes from this
 * template, never from a language model. No adjective of appreciation, no comparison, no person.
 */

// fr-FR separates thousands with U+202F, which the display font lacks: use U+00A0 instead.
const nbsp = (s: string) => s.replace(/\u202f/g, "\u00a0");
const fmt = (n: number, digits: number) =>
  nbsp(n.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: digits }));

/** "934 €", rounded to the euro: the producer's figure carries more digits than it means. */
export function formatEurosParHabitant(n: number): string {
  return `${fmt(Math.round(n), 0)}\u00a0€`;
}

/** "606 193 €", "132,9 millions d'euros", "1,57 milliard d'euros". */
export function formatMontant(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) {
    const v = n / 1e9;
    return `${fmt(v, 2)} ${Math.abs(v) < 2 ? "milliard" : "milliards"} d'euros`;
  }
  if (abs >= 1e6) {
    const v = n / 1e6;
    return `${fmt(v, 1)} ${Math.abs(v) < 2 ? "million" : "millions"} d'euros`;
  }
  return `${fmt(Math.round(n), 0)}\u00a0€`;
}

export function absenceWords(v: CompteValeur): string {
  return v.reason && v.reason in COMPTES_ABSENCE_WORDS
    ? COMPTES_ABSENCE_WORDS[v.reason as CompteAbsenceReason]
    : "Non établi pour cet exercice.";
}

const SUJET: Record<RepereTerritoryKind, string> = {
  COM: "la commune",
  DEP: "le département",
  REG: "la région",
};

/** Entry of the most recent exercise for one aggregate, null when the territory has none. */
export function dernierExercice(
  comptes: ComptesTerritoire,
  key: CompteAgregatKey
): CompteExercice | null {
  const serie = comptes.agregats.find((a) => a.key === key)?.serie ?? [];
  return serie.find((e) => e.exercice === comptes.dernierExercice) ?? null;
}

/**
 * The answer sentence of the block: the operating spending per inhabitant of the latest exercise,
 * then its total. When the accounts are those of another collectivity (Ville de Paris, Collectivité
 * européenne d'Alsace), it is named. Null when nothing is published.
 */
export function comptesPhrase(
  comptes: ComptesTerritoire,
  scale: RepereTerritoryKind
): string | null {
  const y = comptes.dernierExercice;
  const df = y === null ? null : dernierExercice(comptes, "depenses_fonctionnement");
  if (y === null || !df) return null;
  const { parHabitant, montant } = df;
  if (parHabitant.value === null && montant.value === null) return absenceWords(montant);
  const label = parHabitant.scopeLabel ?? montant.scopeLabel;
  const sujet = label ? `la ${label}` : SUJET[scale];
  const total = montant.value === null ? null : formatMontant(montant.value);
  if (parHabitant.value === null) {
    return `En ${y}, ${sujet} a dépensé ${total} pour son fonctionnement.`;
  }
  return `En ${y}, ${sujet} a dépensé ${formatEurosParHabitant(parHabitant.value)} par habitant pour son fonctionnement${total ? `, soit ${total} au total` : ""}.`;
}

/**
 * Bars of the three spending figures per inhabitant, on one scale: the largest of them is the full
 * bar. The debt (a stock) and the savings (a balance, sometimes negative) are never bars.
 */
export function depensesRatios(values: readonly (number | null)[]): (number | null)[] {
  const max = Math.max(0, ...values.filter((v): v is number => v !== null));
  return values.map((v) => (v === null || max === 0 ? null : Math.max(0, v) / max));
}
