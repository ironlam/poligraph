import type { Meta, StoryObj } from "@storybook/react";
import type { CompteAgregatKey } from "@/config/territoire-comptes";
import type { CompteExercice, ComptesTerritoire } from "@/lib/data/territoire-comptes";
import { ComptesSerie } from "./ComptesSerie";

// Fictitious figures, as in every Territoires mock-up.
const KEYS: CompteAgregatKey[] = [
  "depenses_fonctionnement",
  "frais_personnel",
  "depenses_equipement",
  "encours_dette",
  "epargne_brute",
];
const BASE: Record<CompteAgregatKey, number> = {
  depenses_fonctionnement: 1412,
  frais_personnel: 734,
  depenses_equipement: 388,
  encours_dette: 986,
  epargne_brute: 154,
};
const POPULATION = 142_000;

function serie(key: CompteAgregatKey): CompteExercice[] {
  return [2024, 2023, 2022, 2021, 2020, 2019, 2018].map((exercice, i) => {
    const perHab = BASE[key] - i * 23;
    return {
      exercice,
      parHabitant: { value: perHab, state: "ETABLI", reason: null, scopeLabel: null },
      montant: { value: perHab * POPULATION, state: "ETABLI", reason: null, scopeLabel: null },
    };
  });
}

const COMPTES: ComptesTerritoire = {
  dernierExercice: 2024,
  agregats: KEYS.map((key) => ({ key, serie: serie(key) })),
  source: {
    producer: "Observatoire des finances et de la gestion publique locales (OFGL)",
    resourceUrl: "https://data.ofgl.fr/explore/dataset/ofgl-base-communes-consolidee/",
    licenceName: "Licence Ouverte / Open Licence version 2.0 (Etalab)",
    licenceUrl: "https://www.etalab.gouv.fr/licence-ouverte-open-licence",
    attribution: "« Calcul OFGL, source DGFiP »",
    methodSlug: null,
    importedAt: "2026-11-22T01:05:00.000Z",
  },
};

const meta: Meta<typeof ComptesSerie> = {
  title: "Territoires/ComptesSerie",
  component: ComptesSerie,
  args: { comptes: COMPTES, territoire: "Brest (commune)" },
};

export default meta;
type Story = StoryObj<typeof ComptesSerie>;

export const Commune: Story = {};

export const CommuneFormeeEn2021: Story = {
  args: {
    comptes: {
      ...COMPTES,
      agregats: COMPTES.agregats.map((a) => ({
        ...a,
        serie: a.serie.map((e) =>
          e.exercice < 2021
            ? {
                exercice: e.exercice,
                parHabitant: {
                  value: null,
                  state: "NON_ETABLI",
                  reason: "COMMUNE_FORMEE_APRES",
                  scopeLabel: null,
                },
                montant: {
                  value: null,
                  state: "NON_ETABLI",
                  reason: "COMMUNE_FORMEE_APRES",
                  scopeLabel: null,
                },
              }
            : e
        ),
      })),
    },
  },
};
