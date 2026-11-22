import { describe, expect, it } from "vitest";
import { COMPTES_ABSENCE_WORDS, type CompteAgregatKey } from "@/config/territoire-comptes";
import type { CompteValeur, ComptesTerritoire } from "@/lib/data/territoire-comptes";
import {
  comptesPhrase,
  depensesRatios,
  formatEurosParHabitant,
  formatMontant,
} from "@/lib/territoires/comptes-phrase";

const v = (value: number | null, over: Partial<CompteValeur> = {}): CompteValeur => ({
  value,
  state: value === null ? "NON_ETABLI" : "ETABLI",
  reason: null,
  scopeLabel: null,
  ...over,
});

// Brest, 2024, values of the OFGL (dépenses de fonctionnement).
function comptes(parHabitant: CompteValeur, montant: CompteValeur, y = 2024): ComptesTerritoire {
  const keys: CompteAgregatKey[] = [
    "depenses_fonctionnement",
    "frais_personnel",
    "depenses_equipement",
    "encours_dette",
    "epargne_brute",
  ];
  return {
    dernierExercice: y,
    agregats: keys.map((key) => ({
      key,
      serie: key === "depenses_fonctionnement" ? [{ exercice: y, parHabitant, montant }] : [],
    })),
    source: null,
  };
}

describe("gabarit des comptes de la collectivité", () => {
  it("dit les euros par habitant d'abord, le montant ensuite, l'exercice toujours", () => {
    expect(comptesPhrase(comptes(v(934.2919808), v(132888085.6)), "COM")).toBe(
      "En 2024, la commune a dépensé 934 € par habitant pour son fonctionnement, soit 132,9 millions d'euros au total."
    );
  });

  it("nomme la collectivité qui porte les comptes quand ce n'est pas le territoire", () => {
    const label = { scopeLabel: "Collectivité européenne d'Alsace" };
    expect(comptesPhrase(comptes(v(886.53, label), v(1732051827.97, label)), "DEP")).toBe(
      "En 2024, la Collectivité européenne d'Alsace a dépensé 887 € par habitant pour son fonctionnement, soit 1,73 milliard d'euros au total."
    );
  });

  it("dit le motif quand les comptes ne sont pas établis, jamais zéro", () => {
    const absent = v(null, { reason: "COLLECTIVITE_UNIQUE" });
    expect(comptesPhrase(comptes(absent, absent), "DEP")).toBe(
      COMPTES_ABSENCE_WORDS.COLLECTIVITE_UNIQUE
    );
  });

  it("garde le montant d'une commune sans habitant, sans chiffre par habitant", () => {
    expect(comptesPhrase(comptes(v(null, { reason: "POPULATION_NULLE" }), v(12500)), "COM")).toBe(
      "En 2024, la commune a dépensé 12 500 € pour son fonctionnement."
    );
  });

  it("ne dit rien tant que rien n'est publié", () => {
    expect(comptesPhrase({ dernierExercice: null, agregats: [], source: null }, "REG")).toBeNull();
  });

  it("écrit les montants en français, signe compris, sans tiret long", () => {
    expect(formatMontant(606192.9)).toBe("606 193 €");
    expect(formatMontant(1_000_000)).toBe("1 million d'euros");
    expect(formatMontant(2_500_000)).toBe("2,5 millions d'euros");
    expect(formatMontant(1_570_377_998.73)).toBe("1,57 milliard d'euros");
    expect(formatMontant(-263_763)).toBe("-263 763 €");
    expect(formatEurosParHabitant(-12.4)).toBe("-12 €");
    for (const s of [formatMontant(-3e9), formatEurosParHabitant(-1)])
      expect(s).not.toMatch(/[—– ]/);
  });

  it("met les trois dépenses sur une échelle, la plus grande pleine", () => {
    expect(depensesRatios([934.29, 406.89, 135.71])).toEqual([1, 406.89 / 934.29, 135.71 / 934.29]);
    expect(depensesRatios([null, 10, 5])).toEqual([null, 1, 0.5]);
    expect(depensesRatios([null, null, null])).toEqual([null, null, null]);
  });

  it("n'emploie aucun mot d'appréciation dans les textes affichés", () => {
    const texts = [
      ...Object.values(COMPTES_ABSENCE_WORDS),
      comptesPhrase(comptes(v(934), v(1)), "REG") as string,
    ];
    for (const t of texts) {
      expect(t).not.toMatch(/élevé|faible|endetté|bonne gestion|mauvais|lourd|excessi|[—–]/i);
    }
  });
});
