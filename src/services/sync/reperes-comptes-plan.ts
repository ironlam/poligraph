/**
 * Pure rules of the accounts import (Territoires v2, lot C, "Les comptes de la collectivité").
 * No network, no database: OFGL rows of one scale and one exercise in, `TerritoireRepere` rows
 * and a report out. The importer refuses to write a plan that carries any anomaly.
 *
 * Rules measured on the OFGL datasets on 2026-11-22 (communes 2018 and 2024, departments and
 * regions 2018 to 2025):
 * - `montant` = `montant_bp` + `montant_ba` - `montant_flux` on every row: the consolidation is
 *   checked again here, and `euros_par_habitant` against `montant / ptot`.
 * - The per-inhabitant figure is the producer's; a commune with no population (the six
 *   "villages morts" of the Meuse) has none.
 * - Each territory carries the five aggregates or none: a partial set is an anomaly, never a zero
 *   (OFGL once removed rows whose amount was nil).
 */
import {
  ARRONDISSEMENT_PLM,
  COMPTES_ABSENCES,
  COMPTES_AGREGATS,
  COMPTES_DEP_BY_SIREN,
  COMPTES_DERNIER_EXERCICE,
  COMPTES_PREMIER_EXERCICE,
  COMPTES_SCOPE_LABELS,
  COMPTES_UNITS,
  compteIndicatorKey,
  HORS_PERIMETRE_OFGL,
  type CompteAbsenceReason,
  type CompteAgregat,
  type CompteMesure,
} from "@/config/territoire-comptes";
import type { RepereTerritoryKind } from "@/config/territoire-reperes";
import type { OfglRow } from "@/lib/api/ofgl";

/** Tolerance of the consolidation identity, in euros (amounts carry cents). */
const CONSOLIDATION_TOLERANCE = 0.05;
/** Relative tolerance between `euros_par_habitant` and `montant / ptot`. */
const PER_HAB_TOLERANCE = 1e-6;

export interface CompteRepereRow {
  territoryCode: string;
  indicatorKey: string;
  periodStart: string;
  periodEnd: string;
  /** SIREN of the accounting entity, empty when the territory has no accounts row. */
  scopeId: string;
  scopeLabel: string | null;
  value: number | null;
  unit: string;
  state: "ETABLI" | "NON_ETABLI" | "HORS_COUVERTURE";
  reason: CompteAbsenceReason | null;
}

export interface CompteAnomaly {
  code: string;
  agregat: string;
  detail: string;
}

export interface ComptesPlan {
  rows: CompteRepereRow[];
  /** Territories with their five aggregates read. */
  covered: number;
  /** Territories without accounts, by reason. */
  absent: Partial<Record<CompteAbsenceReason, string[]>>;
  /** Source codes or SIRENs that are no Poligraph territory (former communes, Métropole de Lyon). */
  horsTerritoire: string[];
  anomalies: CompteAnomaly[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** Poligraph territories an OFGL row belongs to. */
function territoriesOf(scale: RepereTerritoryKind, row: OfglRow): readonly string[] {
  if (scale === "COM") return [str(row.insee)];
  if (scale === "REG") return [str(row.reg_code)];
  return COMPTES_DEP_BY_SIREN[str(row.siren)] ?? [str(row.dep_code)];
}

function period(exercice: number, agregat: CompteAgregat) {
  const end = `${exercice}-12-31`;
  // The debt is a stock at 31 December, not a flow over the year.
  return {
    periodStart: agregat.key === "encours_dette" ? end : `${exercice}-01-01`,
    periodEnd: end,
  };
}

function absenceReason(scale: RepereTerritoryKind, code: string): CompteAbsenceReason {
  const fixed = COMPTES_ABSENCES[scale][code];
  if (fixed) return fixed;
  if (scale === "COM" && ARRONDISSEMENT_PLM.test(code)) return "ARRONDISSEMENT_SANS_COMPTE";
  if (scale === "COM" && HORS_PERIMETRE_OFGL.test(code)) return "HORS_PERIMETRE_OFGL";
  return "COMPTE_NON_PUBLIE";
}

export function planComptes(input: {
  scale: RepereTerritoryKind;
  exercice: number;
  rows: readonly OfglRow[];
  /** Poligraph territories of the scale to cover. */
  territoryCodes: readonly string[];
}): ComptesPlan {
  const { scale, exercice } = input;
  if (exercice < COMPTES_PREMIER_EXERCICE || exercice > COMPTES_DERNIER_EXERCICE) {
    throw new Error(
      `Exercice ${exercice} hors de la série ${COMPTES_PREMIER_EXERCICE}-${COMPTES_DERNIER_EXERCICE}`
    );
  }
  const known = new Set(input.territoryCodes);
  const byName = new Map(COMPTES_AGREGATS.map((a) => [a.ofglAgregat, a]));
  const plan: ComptesPlan = { rows: [], covered: 0, absent: {}, horsTerritoire: [], anomalies: [] };
  const hors = new Set<string>();
  // territory -> aggregate key -> source row
  const found = new Map<string, Map<string, OfglRow>>();

  for (const row of input.rows) {
    const agregat = byName.get(str(row.agregat));
    if (!agregat) continue;
    const territories = territoriesOf(scale, row);
    const id = territories.join("+");
    const anomaly = (detail: string) =>
      plan.anomalies.push({ code: id, agregat: agregat.ofglAgregat, detail });

    if (Number(str(row.exer).slice(0, 4)) !== exercice) {
      anomaly(`exercice ${str(row.exer)} au lieu de ${exercice}`);
      continue;
    }
    const montant = num(row.montant);
    if (montant === null) {
      anomaly("montant absent");
      continue;
    }
    const bp = num(row.montant_bp);
    const ba = num(row.montant_ba);
    const flux = num(row.montant_flux);
    if (bp === null || ba === null || flux === null) {
      anomaly("montant_bp, montant_ba ou montant_flux absent : la consolidation ne se vérifie pas");
      continue;
    }
    if (Math.abs(bp + ba - flux - montant) > CONSOLIDATION_TOLERANCE) {
      anomaly(`consolidation : ${bp} + ${ba} - ${flux} ne donne pas ${montant}`);
      continue;
    }
    const ptot = num(row.ptot);
    const perHab = num(row.euros_par_habitant);
    if (ptot && perHab !== null) {
      const expected = montant / ptot;
      if (Math.abs(expected - perHab) > PER_HAB_TOLERANCE * Math.max(1, Math.abs(perHab))) {
        anomaly(`euros par habitant ${perHab} au lieu de ${expected}`);
        continue;
      }
    }

    for (const code of territories) {
      if (!known.has(code)) {
        hors.add(code || str(row.siren));
        continue;
      }
      const own = found.get(code) ?? new Map<string, OfglRow>();
      if (own.has(agregat.key)) {
        anomaly(`deux lignes pour ${code}`);
        continue;
      }
      own.set(agregat.key, row);
      found.set(code, own);
    }
  }

  const write = (
    code: string,
    agregat: CompteAgregat,
    mesure: CompteMesure,
    rest: Pick<CompteRepereRow, "scopeId" | "scopeLabel" | "value" | "state" | "reason">
  ) =>
    plan.rows.push({
      territoryCode: code,
      indicatorKey: compteIndicatorKey(agregat.key, mesure),
      ...period(exercice, agregat),
      unit: COMPTES_UNITS[mesure],
      ...rest,
    });

  for (const code of input.territoryCodes) {
    const own = found.get(code);
    if (!own) {
      const reason = absenceReason(scale, code);
      (plan.absent[reason] ??= []).push(code);
      const state = reason === "HORS_PERIMETRE_OFGL" ? "HORS_COUVERTURE" : "NON_ETABLI";
      for (const agregat of COMPTES_AGREGATS) {
        for (const mesure of ["PAR_HABITANT", "MONTANT"] as const) {
          write(code, agregat, mesure, {
            scopeId: "",
            scopeLabel: null,
            value: null,
            state,
            reason,
          });
        }
      }
      continue;
    }
    if (own.size !== COMPTES_AGREGATS.length) {
      plan.anomalies.push({
        code,
        agregat: COMPTES_AGREGATS.filter((a) => !own.has(a.key))
          .map((a) => a.ofglAgregat)
          .join(", "),
        detail: "agrégat absent de la source",
      });
      continue;
    }
    plan.covered++;
    for (const agregat of COMPTES_AGREGATS) {
      const row = own.get(agregat.key) as OfglRow;
      const siren = str(row.siren);
      const scope = { scopeId: siren, scopeLabel: COMPTES_SCOPE_LABELS[siren] ?? null };
      const montant = num(row.montant) as number;
      const perHab = num(row.ptot) ? num(row.euros_par_habitant) : null;
      // Only the savings can be negative; a negative spending or debt is a source artefact.
      if (montant < 0 && agregat.key !== "epargne_brute") {
        const nonEtabli = { ...scope, value: null, state: "NON_ETABLI" as const };
        write(code, agregat, "MONTANT", { ...nonEtabli, reason: "VALEUR_NEGATIVE_SOURCE" });
        write(code, agregat, "PAR_HABITANT", { ...nonEtabli, reason: "VALEUR_NEGATIVE_SOURCE" });
        continue;
      }
      write(code, agregat, "MONTANT", {
        ...scope,
        value: round2(montant),
        state: "ETABLI",
        reason: null,
      });
      write(code, agregat, "PAR_HABITANT", {
        ...scope,
        value: perHab === null ? null : round2(perHab),
        state: perHab === null ? "NON_ETABLI" : "ETABLI",
        reason: perHab === null ? "POPULATION_NULLE" : null,
      });
    }
  }
  plan.horsTerritoire = [...hors].sort();
  return plan;
}
