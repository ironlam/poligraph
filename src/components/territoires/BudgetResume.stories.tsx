import type { Meta, StoryObj } from "@storybook/react";
import type { CompteAgregatKey } from "@/config/territoire-comptes";
import type { CompteValeur, ComptesTerritoire } from "@/lib/data/territoire-comptes";
import { BudgetResume } from "./BudgetResume";

// Fictitious figures, as in every Territoires mock-up.
const v = (value: number | null, over: Partial<CompteValeur> = {}): CompteValeur => ({
  value,
  state: value === null ? "NON_ETABLI" : "ETABLI",
  reason: null,
  scopeLabel: null,
  ...over,
});

function comptes(
  values: Record<CompteAgregatKey, [CompteValeur, CompteValeur]>,
  dernierExercice: number | null = 2024
): ComptesTerritoire {
  return {
    dernierExercice,
    agregats: (Object.keys(values) as CompteAgregatKey[]).map((key) => ({
      key,
      serie:
        dernierExercice === null
          ? []
          : [{ exercice: dernierExercice, parHabitant: values[key][0], montant: values[key][1] }],
    })),
    source: {
      producer: "Observatoire des finances et de la gestion publique locales (OFGL)",
      resourceUrl: "https://data.ofgl.fr/explore/dataset/ofgl-base-communes-consolidee/",
      licenceName: "Licence Ouverte / Open Licence version 2.0 (Etalab)",
      licenceUrl: "https://www.etalab.gouv.fr/licence-ouverte-open-licence",
      attribution: "« Calcul OFGL, source DGFiP »",
      methodSlug: null,
      importedAt: "2026-11-22T08:00:00.000Z",
    },
  };
}

const COMMUNE = comptes({
  depenses_fonctionnement: [v(1412), v(201_000_000)],
  frais_personnel: [v(734), v(104_500_000)],
  depenses_equipement: [v(388), v(55_200_000)],
  encours_dette: [v(986), v(140_300_000)],
  epargne_brute: [v(-21), v(-3_000_000)],
});

const absent = (reason: string) => v(null, { reason });

const meta: Meta<typeof BudgetResume> = {
  title: "Territoires/BudgetResume",
  component: BudgetResume,
  args: { comptes: COMMUNE, scale: "COM" },
};

export default meta;
type Story = StoryObj<typeof BudgetResume>;

export const Commune: Story = {};

export const CollectiviteQuiPorteLesComptes: Story = {
  args: {
    scale: "DEP",
    comptes: comptes(
      Object.fromEntries(
        (
          [
            "depenses_fonctionnement",
            "frais_personnel",
            "depenses_equipement",
            "encours_dette",
            "epargne_brute",
          ] as const
        ).map((k, i) => [
          k,
          [
            v(900 - i * 150, { scopeLabel: "Collectivité exemple" }),
            v(1_700_000_000 - i * 3e8, { scopeLabel: "Collectivité exemple" }),
          ],
        ])
      ) as Record<CompteAgregatKey, [CompteValeur, CompteValeur]>
    ),
  },
};

export const CollectiviteUnique: Story = {
  args: {
    scale: "DEP",
    comptes: comptes({
      depenses_fonctionnement: [absent("COLLECTIVITE_UNIQUE"), absent("COLLECTIVITE_UNIQUE")],
      frais_personnel: [absent("COLLECTIVITE_UNIQUE"), absent("COLLECTIVITE_UNIQUE")],
      depenses_equipement: [absent("COLLECTIVITE_UNIQUE"), absent("COLLECTIVITE_UNIQUE")],
      encours_dette: [absent("COLLECTIVITE_UNIQUE"), absent("COLLECTIVITE_UNIQUE")],
      epargne_brute: [absent("COLLECTIVITE_UNIQUE"), absent("COLLECTIVITE_UNIQUE")],
    }),
  },
};

export const CommuneSansHabitant: Story = {
  args: {
    comptes: comptes({
      depenses_fonctionnement: [absent("POPULATION_NULLE"), v(12_500)],
      frais_personnel: [absent("POPULATION_NULLE"), v(3_100)],
      depenses_equipement: [absent("POPULATION_NULLE"), v(0)],
      encours_dette: [absent("POPULATION_NULLE"), v(0)],
      epargne_brute: [absent("POPULATION_NULLE"), v(1_800)],
    }),
  },
};
