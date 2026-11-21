import { describe, expect, it } from "vitest";
import {
  COMPTES_AGREGATS,
  COMPTES_DATASETS,
  COMPTES_DERNIER_EXERCICE,
  COMPTES_INDICATOR_PREFIX,
  COMPTES_PREMIER_EXERCICE,
  COMPTES_UNITS,
  compteIndicatorKey,
  compteLabel,
  compteRepereSource,
  parseCompteIndicatorKey,
  type CompteMesure,
} from "@/config/territoire-comptes";
import { repereMethode } from "@/config/territoire-methodes";
import { REPERE_INDICATORS } from "@/config/territoire-reperes";
import fixture from "./fixtures/ofgl-definitions-agregats.json";

const MESURES: CompteMesure[] = ["PAR_HABITANT", "MONTANT"];
const allKeys = COMPTES_AGREGATS.flatMap((a) => MESURES.map((m) => compteIndicatorKey(a.key, m)));

describe("configuration des comptes de la collectivité", () => {
  it("garde cinq agrégats au plus dans le résumé", () => {
    expect(COMPTES_AGREGATS).toHaveLength(5);
  });

  it("nomme chaque agrégat comme l'OFGL l'écrit", () => {
    const official = new Set(fixture.results.map((r) => r.agregat));
    for (const a of COMPTES_AGREGATS) expect(official.has(a.ofglAgregat), a.key).toBe(true);
  });

  it("relie chaque agrégat à une page de méthode de la famille des comptes", () => {
    for (const a of COMPTES_AGREGATS) {
      expect(repereMethode(a.methodSlug)?.famille, a.key).toBe("COMPTES");
      expect(compteLabel(a)).toBe(repereMethode(a.methodSlug)?.title);
    }
  });

  it("donne deux clés distinctes par agrégat, hors du bloc « Le territoire en chiffres »", () => {
    expect(new Set(allKeys).size).toBe(10);
    const chiffres = new Set(REPERE_INDICATORS.map((i) => i.key));
    for (const k of allKeys) {
      expect(k.startsWith(COMPTES_INDICATOR_PREFIX), k).toBe(true);
      expect(chiffres.has(k), k).toBe(false);
    }
    for (const i of REPERE_INDICATORS) {
      expect(i.key.startsWith(COMPTES_INDICATOR_PREFIX), i.key).toBe(false);
    }
  });

  it("retrouve l'agrégat et la mesure depuis la clé, et rien d'autre", () => {
    for (const a of COMPTES_AGREGATS) {
      for (const m of MESURES) {
        const parsed = parseCompteIndicatorKey(compteIndicatorKey(a.key, m));
        expect(parsed?.agregat.key).toBe(a.key);
        expect(parsed?.mesure).toBe(m);
      }
    }
    expect(parseCompteIndicatorKey("population_municipale")).toBeUndefined();
    expect(parseCompteIndicatorKey("comptes_impots_locaux_montant")).toBeUndefined();
  });

  it("affiche les euros par habitant comme une unité distincte du montant", () => {
    expect(COMPTES_UNITS.PAR_HABITANT).toBe("€/hab");
    expect(COMPTES_UNITS.MONTANT).toBe("€");
  });

  it("construit la source de chaque échelle depuis le registre, sans page de méthode unique", () => {
    for (const scale of ["COM", "DEP", "REG"] as const) {
      const s = compteRepereSource(scale);
      expect(s.producer).toMatch(/OFGL/);
      expect(s.resourceUrl).toContain(COMPTES_DATASETS[scale].datasetId);
      expect(s.licenceName).toMatch(/Licence Ouverte/);
      expect(s.licenceUrl).toMatch(/^https:\/\//);
      expect(s.attribution).toMatch(/Calcul OFGL, source DGFiP/);
      expect(s.methodSlug).toBeNull();
    }
  });

  it("borne la série entre 2018 et un exercice définitif", () => {
    expect(COMPTES_PREMIER_EXERCICE).toBe(2018);
    expect(COMPTES_DERNIER_EXERCICE).toBeGreaterThanOrEqual(COMPTES_PREMIER_EXERCICE);
    // 2025 is provisional until OFGL's December 2026 update (97 communes missing on 2026-11-21).
    expect(COMPTES_DERNIER_EXERCICE).toBe(2024);
  });
});
