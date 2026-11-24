import type { Meta, StoryObj } from "@storybook/react";
import { MesureBarre } from "./MesureBarre";

// Fictitious figures, as in every Territoires mock-up.
const meta: Meta<typeof MesureBarre> = {
  title: "Territoires/MesureBarre",
  component: MesureBarre,
  args: {
    label: "Dépenses de fonctionnement",
    valeur: "1 412 €",
    ratio: 1,
    detail: "201 millions d'euros au total",
  },
  decorators: [(Story) => <div className="max-w-sm">{Story()}</div>],
};

export default meta;
type Story = StoryObj<typeof MesureBarre>;

export const Pleine: Story = {};

export const Partielle: Story = {
  args: { label: "Frais de personnel", valeur: "734 €", ratio: 0.52, detail: null },
};

export const NonEtablie: Story = {
  args: {
    valeur: null,
    ratio: null,
    nonEtabli: "Pas de montant par habitant : la commune n'a pas d'habitant recensé.",
  },
};
