/**
 * Import of "Les comptes de la collectivité" (Territoires v2, lot C) into `TerritoireRepere`.
 * Rules: ./reperes-comptes-plan.ts. Network: @/lib/api/ofgl.
 *
 * One batch per scale, written DRAFT and nothing else: a person reads a sample and the counts in
 * /admin/territoires/reperes, then publishes the whole batch. A plan that carries any anomaly is
 * not written. Re-running replaces the earlier draft of the same source; an exercise already held
 * by a reviewed or published batch stops the run.
 */
import { db } from "@/lib/db";
import {
  COMPTES_AGREGATS,
  COMPTES_DATASETS,
  COMPTES_DISPONIBILITE_DATASET,
  COMPTES_DERNIER_EXERCICE,
  COMPTES_INDICATOR_PREFIX,
  COMPTES_PREMIER_EXERCICE,
  compteRepereSource,
} from "@/config/territoire-comptes";
import type { RepereTerritoryKind } from "@/config/territoire-reperes";
import { REGIONS } from "@/config/regions";
import { TERRITOIRE_COMMUNE_MIN_POPULATION } from "@/lib/seo/territoire-robots";
import { createOfglClient, type OfglRow } from "@/lib/api/ofgl";
import { planComptes, type ComptesPlan } from "./reperes-comptes-plan";

const CHUNK = 5000;

/**
 * Share of the territories that must carry accounts in every exercise. Measured on 2026-11-22:
 * 17 of 18 regions, 97 of 101 departments, 10 025 of 10 099 communes of 1 000 inhabitants and
 * more. A lower share means a broken read (a mistyped field once matched no commune at all, with
 * zero anomaly), not missing accounts.
 */
export const COMPTES_MIN_COUVERTURE = 0.9;

/** Fields the plan reads, plus the code field of each scale. */
const SELECT =
  "exer,siren,agregat,montant,montant_bp,montant_ba,montant_flux,euros_par_habitant,ptot";
const CODE_FIELD: Record<RepereTerritoryKind, string> = {
  COM: "insee",
  DEP: "dep_code",
  REG: "reg_code",
};

export type ComptesPerimetre = "COMMUNES_INDEXABLES" | "TOUTES";

export interface ComptesImportResult {
  dryRun: boolean;
  scale: RepereTerritoryKind;
  territories: number;
  plans: { exercice: number; plan: ComptesPlan }[];
  rowsPlanned: number;
  importId: string | null;
  rowsWritten: number;
}

/** What the import reads for one exercise: the accounts, and for communes their availability. */
export interface ComptesSource {
  rows(exercice: number): Promise<OfglRow[]>;
  disponibilite(exercice: number): Promise<OfglRow[]>;
}

function ofglSource(scale: RepereTerritoryKind): ComptesSource {
  const client = createOfglClient();
  return {
    rows: (exercice) =>
      client.exportRows(COMPTES_DATASETS[scale].datasetId, {
        where: `year(exer)=${exercice} and ${agregatFilter()}`,
        select: `${SELECT},${CODE_FIELD[scale]}`,
      }),
    disponibilite: (exercice) =>
      client.exportRows(COMPTES_DISPONIBILITE_DATASET, {
        where: `year(annee)=${exercice}`,
        select: "annee,siren,presence_budget,insee_25,siren_25",
      }),
  };
}

export function exercicesOfSeries(): number[] {
  const years: number[] = [];
  for (let y = COMPTES_PREMIER_EXERCICE; y <= COMPTES_DERNIER_EXERCICE; y++) years.push(y);
  return years;
}

/**
 * Poligraph territories of a scale. Communes start with those at or above the indexing
 * population floor (a superset of the indexable pages, which also need an established mayor):
 * the rest waits for a measure of the first batch.
 */
async function territoryCodes(
  scale: RepereTerritoryKind,
  perimetre: ComptesPerimetre
): Promise<string[]> {
  if (scale === "REG") return REGIONS.map((r) => r.code);
  if (scale === "DEP") return REGIONS.flatMap((r) => [...r.departmentCodes]);
  const communes = await db.commune.findMany({
    where:
      perimetre === "COMMUNES_INDEXABLES"
        ? { population: { gte: TERRITOIRE_COMMUNE_MIN_POPULATION } }
        : {},
    select: { id: true },
    orderBy: { id: "asc" },
  });
  return communes.map((c) => c.id);
}

function agregatFilter(): string {
  return `agregat in (${COMPTES_AGREGATS.map((a) => JSON.stringify(a.ofglAgregat)).join(",")})`;
}

export async function syncReperesComptes(opts: {
  scale: RepereTerritoryKind;
  dryRun: boolean;
  exercices?: number[];
  perimetre?: ComptesPerimetre;
  /** Injected in tests; the real client otherwise. */
  source?: ComptesSource;
}): Promise<ComptesImportResult> {
  const { scale, dryRun } = opts;
  const exercices = opts.exercices ?? exercicesOfSeries();
  const repereSourceData = compteRepereSource(scale);
  const codes = await territoryCodes(scale, opts.perimetre ?? "COMMUNES_INDEXABLES");

  const source = opts.source ?? ofglSource(scale);

  const plans: ComptesImportResult["plans"] = [];
  for (const exercice of exercices) {
    plans.push({
      exercice,
      plan: planComptes({
        scale,
        exercice,
        rows: await source.rows(exercice),
        territoryCodes: codes,
        disponibilite: scale === "COM" ? await source.disponibilite(exercice) : undefined,
      }),
    });
  }
  const rowsPlanned = plans.reduce((n, p) => n + p.plan.rows.length, 0);
  const result: ComptesImportResult = {
    dryRun,
    scale,
    territories: codes.length,
    plans,
    rowsPlanned,
    importId: null,
    rowsWritten: 0,
  };
  if (dryRun) return result;

  const anomalies = plans.reduce((n, p) => n + p.plan.anomalies.length, 0);
  if (anomalies > 0) throw new Error(`${anomalies} anomalies dans le plan : rien n'est écrit.`);
  const faible = plans.find((p) => p.plan.covered < COMPTES_MIN_COUVERTURE * codes.length);
  if (faible) {
    throw new Error(
      `${faible.exercice} : ${faible.plan.covered} territoires sur ${codes.length} avec des comptes, couverture anormalement basse : rien n'est écrit.`
    );
  }

  // A reviewed or published batch already holds one of these exercises: a published figure is
  // never replaced by a script. A rejected batch settles nothing.
  const settled = await db.territoireRepere.count({
    where: {
      territoryType: scale,
      indicatorKey: { startsWith: COMPTES_INDICATOR_PREFIX },
      periodEnd: { in: exercices.map((y) => new Date(`${y}-12-31`)) },
      import: { status: { in: ["IN_REVIEW", "PUBLISHED"] } },
    },
  });
  if (settled > 0)
    throw new Error("Un lot relu ou publié couvre déjà un de ces exercices : arrêt.");

  const repereSource =
    (await db.repereSource.findFirst({
      where: { resourceUrl: repereSourceData.resourceUrl, methodSlug: null },
    })) ?? (await db.repereSource.create({ data: repereSourceData }));

  // Earlier drafts and rejected batches of this source were never public: replaced.
  await db.repereImport.deleteMany({
    where: { sourceId: repereSource.id, status: { in: ["DRAFT", "REJECTED"] } },
  });
  const batch = await db.repereImport.create({
    data: { sourceId: repereSource.id, status: "DRAFT", rowCount: rowsPlanned },
  });

  const rows = plans.flatMap((p) => p.plan.rows);
  let written = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const res = await db.territoireRepere.createMany({
      data: rows.slice(i, i + CHUNK).map((r) => ({
        territoryType: scale,
        territoryCode: r.territoryCode,
        cogEdition: null,
        indicatorKey: r.indicatorKey,
        periodStart: new Date(r.periodStart),
        periodEnd: new Date(r.periodEnd),
        scopeKind: "COLLECTIVITE" as const,
        scopeId: r.scopeId,
        scopeLabel: r.scopeLabel,
        value: r.value,
        unit: r.unit,
        state: r.state,
        reason: r.reason,
        importId: batch.id,
      })),
    });
    written += res.count;
  }
  return { ...result, importId: batch.id, rowsWritten: written };
}
