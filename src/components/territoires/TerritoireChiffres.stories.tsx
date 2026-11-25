import type { Meta, StoryObj } from "@storybook/react";
import type { CommuneChiffres } from "@/lib/data/territoire-chiffres";
import type { RepereRow } from "@/lib/data/territoire-reperes";
import { TerritoireChiffres } from "./TerritoireChiffres";

// Fictitious figures, as in every Territoires mock-up.
const source = {
  producer: "INSEE",
  resourceUrl: "https://example.test/ressource",
  licenceName: "Licence Ouverte 2.0",
  licenceUrl: "https://example.test/licence",
  attribution: "Source : INSEE",
  methodSlug: "structure-par-age",
  importedAt: "2026-10-13T08:00:00.000Z",
};

const row = (
  indicatorKey: string,
  value: number | null,
  over: Partial<RepereRow> = {}
): RepereRow => ({
  indicatorKey,
  periodStart: "2022-01-01",
  periodEnd: "2022-12-31",
  scopeKind: "COMMUNE",
  scopeId: "",
  scopeLabel: null,
  value,
  unit: "%",
  sampleSize: null,
  state: value === null ? "NON_ETABLI" : "ETABLI",
  reason: null,
  source,
  ...over,
});

const station = {
  scopeKind: "STATION" as const,
  scopeLabel: "SAINT-EXEMPLE AÉRODROME, à 9 km",
  periodStart: "1991-01-01",
  periodEnd: "2020-12-31",
  source: { ...source, producer: "Météo-France", methodSlug: "climat" },
};

const AGES = [
  row("age_tranche_0_14", 14),
  row("age_tranche_15_29", 28.8),
  row("age_tranche_30_44", 18.4),
  row("age_tranche_45_59", 16.3),
  row("age_tranche_60_74", 13.5),
  row("age_tranche_75_plus", 9),
];

const CLIMAT = [
  row("climat_temp_moyenne", 11.7, { ...station, unit: "°C" }),
  row("climat_precipitations", 1229.8, { ...station, unit: "mm" }),
];

const EAU = row("eau_nitrates", 0, {
  scopeKind: "UDI",
  scopeId: "029000123",
  scopeLabel: "SAINT-EXEMPLE CENTRE",
  periodStart: "2025-09-01",
  periodEnd: "2026-08-31",
  unit: "analyses",
  sampleSize: 63,
  source: { ...source, producer: "Ministère chargé de la santé", methodSlug: "eau-du-robinet" },
});

const chiffres = (reperes: RepereRow[], over: Partial<CommuneChiffres> = {}): CommuneChiffres => ({
  inseeCode: "99019",
  population: { millesime: 2023, value: 142346, producer: "INSEE", effectiveFrom: "2026-01-01" },
  evolution: {
    ok: true,
    from: { millesime: 2022, value: 140993 },
    to: { millesime: 2023, value: 142346 },
  },
  reperes,
  ...over,
});

const meta: Meta<typeof TerritoireChiffres> = {
  title: "Territoires/TerritoireChiffres",
  component: TerritoireChiffres,
  args: { chiffres: chiffres([...AGES, ...CLIMAT, EAU]) },
  decorators: [
    (Story) => (
      <div className="territoire-lecture w-[390px] max-w-full px-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof TerritoireChiffres>;

export const Complet: Story = {};

export const TrancheNonEtablie: Story = {
  args: { chiffres: chiffres([row("age_tranche_0_14", null), ...AGES.slice(1), ...CLIMAT]) },
};

export const SansClimat: Story = { args: { chiffres: chiffres(AGES) } };
