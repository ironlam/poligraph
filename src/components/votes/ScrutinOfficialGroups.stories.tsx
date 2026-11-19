import type { Meta, StoryObj } from "@storybook/react";
import { ScrutinOfficialGroups } from "./ScrutinOfficialGroups";
import type { OfficialGroupDisplayRow } from "@/lib/votes/scrutin-provenance";

/**
 * Données simulées, représentatives de la 17e législature : aucune ne vient de la base.
 */
const meta: Meta<typeof ScrutinOfficialGroups> = {
  title: "Votes/ScrutinOfficialGroups",
  component: ScrutinOfficialGroups,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof ScrutinOfficialGroups>;

const SOURCE = {
  label: "Assemblée nationale",
  url: "https://www.assemblee-nationale.fr/dyn/17/scrutins/12",
};

const row = (
  organeRef: string,
  label: string,
  abbreviation: string,
  counts: [number, number, number, number | null],
  majorityPosition: OfficialGroupDisplayRow["majorityPosition"]
): OfficialGroupDisplayRow => ({
  organeRef,
  label,
  abbreviation,
  memberCount: null,
  forCount: counts[0],
  againstCount: counts[1],
  abstainCount: counts[2],
  nonVoterCount: counts[3],
  majorityPosition,
});

const ROWS: OfficialGroupDisplayRow[] = [
  row("PO1", "Rassemblement National", "RN", [76, 0, 0, 0], "POUR"),
  row("PO2", "Ensemble pour la République", "EPR", [2, 26, 0, 1], "CONTRE"),
  row("PO3", "La France insoumise - Nouveau Front Populaire", "LFI-NFP", [0, 25, 0, 0], "CONTRE"),
  row("PO4", "Socialistes et apparentés", "SOC", [1, 18, 0, 0], "CONTRE"),
  row("PO5", "Droite Républicaine", "DR", [3, 4, 9, 0], "ABSTENTION"),
  row("PO6", "Non inscrits", "NI", [0, 0, 0, null], null),
];

export const Affiche: Story = {
  args: { view: { kind: "shown", rows: ROWS }, source: SOURCE, fetchedAt: new Date("2026-11-18") },
};

export const NonImporte: Story = {
  args: { view: { kind: "not-imported" }, source: SOURCE, fetchedAt: null },
};
