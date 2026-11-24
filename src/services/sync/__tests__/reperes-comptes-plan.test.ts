import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compteIndicatorKey } from "@/config/territoire-comptes";
import type { OfglRow } from "@/lib/api/ofgl";
import { planComptes, type ComptesPlan } from "../reperes-comptes-plan";

// Real OFGL rows (fixtures/ofgl-comptes.csv): Brest, Paris, a commune with a negative staff cost
// (02627), a Meuse village with no inhabitant (55039), Finistère, Paris, Alsace, Métropole de
// Lyon, Mayotte, Bretagne and Corse.
const CODE_FIELD: Record<string, string> = {
  communes2024: "insee",
  departements2024: "dep_code",
  departements2020: "dep_code",
  regions2024: "reg_code",
};
const NUMERIC = new Set([
  "montant",
  "montant_bp",
  "montant_ba",
  "montant_flux",
  "euros_par_habitant",
  "ptot",
]);

function fixture(jeu: string): OfglRow[] {
  const lines = readFileSync(join(__dirname, "fixtures/ofgl-comptes.csv"), "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#"));
  const header = (lines[0] as string).split(";");
  return lines.slice(1).flatMap((line) => {
    const cells = line.split(";");
    if (cells[0] !== jeu) return [];
    const row: OfglRow = {};
    header.slice(1).forEach((h, i) => {
      const v = cells[i + 1] ?? "";
      const key = h === "code" ? (CODE_FIELD[jeu] as string) : h;
      row[key] = NUMERIC.has(h) ? (v === "" ? null : Number(v)) : v;
    });
    return [row];
  });
}

// Real "disponibilité des comptes" rows of 2024 for the same communes, plus Conques-en-Rouergue
// (filed under 12076), Peynier (no account in 2024) and Cugand-la-Bernardière (formed in 2025).
const DISPO: OfglRow[] = readFileSync(
  join(__dirname, "fixtures/ofgl-disponibilite-2024.csv"),
  "utf8"
)
  .split("\n")
  .filter((l) => l && !l.startsWith("#") && !l.startsWith("annee"))
  .map((l) => {
    const [annee, insee, siren, presence_budget, insee_25, siren_25] = l.split(";");
    return { annee, insee, siren, presence_budget, insee_25, siren_25 };
  });

const get = (plan: ComptesPlan, code: string, key: string, mesure: "MONTANT" | "PAR_HABITANT") =>
  plan.rows.find(
    (r) =>
      r.territoryCode === code &&
      r.indicatorKey === compteIndicatorKey(key as "epargne_brute", mesure)
  );

describe("plan d'import des comptes", () => {
  it("reprend les montants et les euros par habitant de l'OFGL pour Brest", () => {
    const plan = planComptes({
      scale: "COM",
      exercice: 2024,
      rows: fixture("communes2024"),
      disponibilite: DISPO,
      territoryCodes: ["29019"],
    });
    expect(plan.anomalies).toEqual([]);
    expect(plan.covered).toBe(1);
    expect(plan.rows).toHaveLength(10);
    const df = get(plan, "29019", "depenses_fonctionnement", "MONTANT");
    expect(df).toMatchObject({
      value: 132888085.6,
      unit: "€",
      state: "ETABLI",
      scopeId: "212900195",
    });
    expect(get(plan, "29019", "depenses_fonctionnement", "PAR_HABITANT")).toMatchObject({
      value: 934.29,
      unit: "€/hab",
    });
    expect(df?.periodStart).toBe("2024-01-01");
    expect(get(plan, "29019", "encours_dette", "MONTANT")?.periodStart).toBe("2024-12-31");
  });

  it("vérifie la consolidation sur un compte à budgets annexes et nomme la Ville de Paris", () => {
    const plan = planComptes({
      scale: "COM",
      exercice: 2024,
      rows: fixture("communes2024"),
      disponibilite: DISPO,
      territoryCodes: ["75056"],
    });
    expect(plan.anomalies).toEqual([]);
    expect(get(plan, "75056", "depenses_equipement", "MONTANT")?.scopeLabel).toBe("Ville de Paris");
  });

  it("garde le montant mais pas de chiffre par habitant pour une commune sans habitant", () => {
    const plan = planComptes({
      scale: "COM",
      exercice: 2024,
      rows: fixture("communes2024"),
      disponibilite: DISPO,
      territoryCodes: ["55039"],
    });
    expect(get(plan, "55039", "depenses_equipement", "MONTANT")).toMatchObject({
      value: 0,
      state: "ETABLI",
    });
    expect(get(plan, "55039", "depenses_equipement", "PAR_HABITANT")).toMatchObject({
      value: null,
      state: "NON_ETABLI",
      reason: "POPULATION_NULLE",
    });
  });

  it("n'affiche pas une dépense négative de la source", () => {
    const plan = planComptes({
      scale: "COM",
      exercice: 2024,
      rows: fixture("communes2024"),
      disponibilite: DISPO,
      territoryCodes: ["02627"],
    });
    for (const mesure of ["MONTANT", "PAR_HABITANT"] as const) {
      expect(get(plan, "02627", "frais_personnel", mesure)).toMatchObject({
        value: null,
        state: "NON_ETABLI",
        reason: "VALEUR_NEGATIVE_SOURCE",
      });
    }
    expect(get(plan, "02627", "depenses_equipement", "MONTANT")?.state).toBe("ETABLI");
  });

  it("motive chaque absence, jamais par un zéro", () => {
    const plan = planComptes({
      scale: "COM",
      exercice: 2024,
      rows: fixture("communes2024"),
      disponibilite: DISPO,
      territoryCodes: ["13072", "85076", "29001", "75101", "97501"],
    });
    expect(plan.anomalies).toEqual([]);
    expect(plan.absent).toEqual({
      COMPTE_NON_PUBLIE: ["13072"],
      COMMUNE_FORMEE_APRES: ["85076"],
      COMMUNE_INCONNUE_OFGL: ["29001"],
      ARRONDISSEMENT_SANS_COMPTE: ["75101"],
      HORS_PERIMETRE_OFGL: ["97501"],
    });
    expect(plan.rows).toHaveLength(50);
    for (const r of plan.rows) expect(r.value).toBeNull();
    expect(plan.rows.filter((r) => r.state === "HORS_COUVERTURE")).toHaveLength(10);
  });

  it("rattache une commune nouvelle par son SIREN, jamais par le code de ses anciennes communes", () => {
    const plan = planComptes({
      scale: "COM",
      exercice: 2024,
      rows: fixture("communes2024"),
      disponibilite: DISPO,
      territoryCodes: ["12218", "85076"],
    });
    // Conques-en-Rouergue files its accounts under 12076, with its own SIREN.
    expect(get(plan, "12218", "encours_dette", "MONTANT")).toMatchObject({
      state: "ETABLI",
      scopeId: "200055929",
    });
    // La Bernardière (85021) joined Cugand-la-Bernardière in 2025: its 2024 accounts are not the
    // new commune's.
    expect(plan.absent).toEqual({ COMMUNE_FORMEE_APRES: ["85076"] });
    expect(plan.horsTerritoire).toContain("218500213");
  });

  it("lit le SIREN de 2025 tel que l'export le type, en entier", () => {
    // Real export shape on 2026-11-22: siren is text, siren_25 is an int.
    const plan = planComptes({
      scale: "COM",
      exercice: 2024,
      rows: fixture("communes2024"),
      disponibilite: DISPO.map((r) => ({ ...r, siren_25: Number(r.siren_25) })),
      territoryCodes: ["29019", "12218"],
    });
    expect(plan.covered).toBe(2);
    expect(plan.anomalies).toEqual([]);
  });

  it("exige la disponibilité pour les communes et signale un compte annoncé mais absent", () => {
    expect(() =>
      planComptes({ scale: "COM", exercice: 2024, rows: [], territoryCodes: ["29019"] })
    ).toThrow(/disponibilité/);
    const plan = planComptes({
      scale: "COM",
      exercice: 2024,
      rows: [],
      disponibilite: DISPO,
      territoryCodes: ["29019"],
    });
    expect(plan.anomalies[0]?.detail).toMatch(/annoncé par la disponibilité/);
  });

  it("range l'Alsace, la Corse et la métropole de Lyon côté départements", () => {
    const plan = planComptes({
      scale: "DEP",
      exercice: 2024,
      rows: fixture("departements2024"),
      territoryCodes: ["29", "75", "67", "68", "2A", "976"],
    });
    expect(plan.anomalies).toEqual([]);
    expect(plan.covered).toBe(5);
    expect(plan.absent).toEqual({ COLLECTIVITE_UNIQUE: ["2A"] });
    expect(plan.horsTerritoire).toEqual(["691"]);
    const bas = get(plan, "67", "encours_dette", "MONTANT");
    const haut = get(plan, "68", "encours_dette", "MONTANT");
    expect(bas?.scopeLabel).toBe("Collectivité européenne d'Alsace");
    expect(haut).toMatchObject({ value: bas?.value, scopeId: "200094332" });
  });

  it("sépare le Bas-Rhin et le Haut-Rhin avant la collectivité européenne", () => {
    const plan = planComptes({
      scale: "DEP",
      exercice: 2020,
      rows: fixture("departements2020"),
      territoryCodes: ["67", "68"],
    });
    expect(plan.anomalies).toEqual([]);
    expect(get(plan, "67", "encours_dette", "MONTANT")?.scopeId).toBe("226700011");
    expect(get(plan, "68", "encours_dette", "MONTANT")?.scopeId).toBe("226800019");
  });

  it("renvoie Mayotte vers son département côté régions", () => {
    const plan = planComptes({
      scale: "REG",
      exercice: 2024,
      rows: fixture("regions2024"),
      territoryCodes: ["53", "94", "06"],
    });
    expect(plan.covered).toBe(2);
    expect(plan.absent).toEqual({ COMPTES_AU_DEPARTEMENT: ["06"] });
  });

  it("signale toute ligne qui ne passe pas les contrôles", () => {
    const brest = fixture("communes2024").filter((r) => r.insee === "29019");
    const run = (rows: OfglRow[]) =>
      planComptes({
        scale: "COM",
        exercice: 2024,
        rows,
        disponibilite: DISPO,
        territoryCodes: ["29019"],
      }).anomalies;
    const tamper = (i: number, patch: OfglRow) =>
      brest.map((r, k) => (k === i ? { ...r, ...patch } : r));

    expect(run(tamper(0, { montant: 1 }))[0]?.detail).toMatch(/consolidation/);
    expect(run(tamper(0, { montant_flux: null }))[0]?.detail).toMatch(/montant_flux/);
    expect(run(tamper(0, { euros_par_habitant: 1 }))[0]?.detail).toMatch(/euros par habitant/);
    expect(run(tamper(0, { exer: "2023" }))[0]?.detail).toMatch(/exercice 2023/);
    expect(run([...brest, brest[0] as OfglRow])[0]?.detail).toMatch(/deux lignes/);
    expect(run(brest.slice(1))[0]?.detail).toMatch(/agrégat absent/);
    expect(run(brest)).toEqual([]);
  });

  it("refuse un exercice hors de la série", () => {
    for (const exercice of [2017, 2025]) {
      expect(() => planComptes({ scale: "COM", exercice, rows: [], territoryCodes: [] })).toThrow(
        /hors de la série/
      );
    }
  });
});
