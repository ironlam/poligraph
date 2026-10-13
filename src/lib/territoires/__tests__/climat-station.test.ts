import { describe, expect, it } from "vitest";
import {
  climatRows,
  distanceKm,
  pickReferenceStation,
  type ClimatStation,
} from "@/lib/territoires/climat-station";

const rennes = { departmentCode: "35", lat: 48.1173, lon: -1.6778 };

const station = (over: Partial<ClimatStation>): ClimatStation => ({
  id: "35281001",
  name: "Station de Rennes-Saint-Jacques",
  departmentCode: "35",
  lat: 48.0686,
  lon: -1.7342,
  tempMoyenne: 12.4,
  precipitations: 680,
  ...over,
});

describe("station de référence", () => {
  it("mesure une distance en kilomètres", () => {
    expect(distanceKm({ lat: 48.8566, lon: 2.3522 }, { lat: 48.8566, lon: 2.3522 })).toBe(0);
    // Paris - Rennes, environ 308 km à vol d'oiseau
    expect(distanceKm({ lat: 48.8566, lon: 2.3522 }, rennes)).toBeGreaterThan(300);
    expect(distanceKm({ lat: 48.8566, lon: 2.3522 }, rennes)).toBeLessThan(320);
  });

  it("choisit la station la plus proche du même département, une seule", () => {
    const near = station({ id: "A" });
    const far = station({ id: "B", lat: 48.3, lon: -1.2 });
    const ref = pickReferenceStation(rennes, [far, near]);
    expect(ref).toMatchObject({ state: "ETABLI", station: { id: "A" } });
    expect(pickReferenceStation(rennes, [near, far])).toEqual(ref);
  });

  it("ne sort jamais du département, même avec une station voisine plus proche", () => {
    const other = station({ id: "X", departmentCode: "44", lat: 48.1173, lon: -1.6778 });
    expect(pickReferenceStation(rennes, [other])).toEqual({
      state: "NON_ETABLI",
      reason: "AUCUNE_STATION_DANS_LE_DEPARTEMENT",
    });
  });

  it("dit non établi au-delà de 30 km, et à 30 km exactement", () => {
    const far = station({ lat: 48.5, lon: -1.0 });
    expect(pickReferenceStation(rennes, [far])).toEqual({
      state: "NON_ETABLI",
      reason: "STATION_TROP_ELOIGNEE",
    });
    const s = station({});
    const km = distanceKm(rennes, s);
    expect(pickReferenceStation(rennes, [s], km)).toMatchObject({ state: "NON_ETABLI" });
    expect(pickReferenceStation(rennes, [s], km + 0.001)).toMatchObject({ state: "ETABLI" });
  });

  it("départage deux stations à égale distance sans dépendre de l'ordre", () => {
    const a = station({ id: "A" });
    const b = station({ id: "B" });
    const one = pickReferenceStation(rennes, [a, b]);
    const two = pickReferenceStation(rennes, [b, a]);
    expect(one).toEqual(two);
  });
});

describe("lignes climatiques", () => {
  it("porte la station, la distance et la période avec chaque valeur", () => {
    const ref = pickReferenceStation(rennes, [station({})]);
    const rows = climatRows("35238", ref);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      indicatorKey: "climat_temp_moyenne",
      value: 12.4,
      state: "ETABLI",
      periodStart: "1991-01-01",
      periodEnd: "2020-12-31",
      scopeKind: "STATION",
    });
    expect(rows[0]?.scopeLabel).toMatch(/^Station de Rennes-Saint-Jacques, à \d+ km$/);
    expect(rows[1]).toMatchObject({ indicatorKey: "climat_precipitations", value: 680 });
  });

  it("écrit des lignes non établies, sans valeur, quand il n'y a pas de station", () => {
    const rows = climatRows("35238", { state: "NON_ETABLI", reason: "STATION_TROP_ELOIGNEE" });
    for (const r of rows) {
      expect(r).toMatchObject({
        value: null,
        state: "NON_ETABLI",
        reason: "STATION_TROP_ELOIGNEE",
      });
      expect(r.scopeLabel).toBeNull();
    }
  });

  it("ne remplace jamais une mesure absente de la station par zéro", () => {
    const ref = pickReferenceStation(rennes, [station({ precipitations: null })]);
    const rows = climatRows("35238", ref);
    expect(rows[1]).toMatchObject({
      value: null,
      state: "NON_ETABLI",
      reason: "VALEUR_ABSENTE_STATION",
    });
    expect(rows[0]?.state).toBe("ETABLI");
  });
});
