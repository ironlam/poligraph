import type { Meta, StoryObj } from "@storybook/react";
import { LigneSource } from "./LigneSource";
import { TerritoireOnglets } from "./TerritoireOnglets";

const meta: Meta<typeof TerritoireOnglets> = {
  title: "Territoires/TerritoireOnglets",
  component: TerritoireOnglets,
  parameters: { layout: "fullscreen" },
  args: {
    onglets: [
      { label: "Élus", href: "#vos-elus" },
      { label: "Parlement", href: "#parlement" },
      { label: "Chiffres", href: "#chiffres" },
      { label: "Élections", href: "#elections" },
      { label: "Sources", href: "#sources" },
    ],
  },
};

export default meta;
type Story = StoryObj<typeof TerritoireOnglets>;

export const CinqOnglets: Story = {};

// Fictitious sources.
export const Source: StoryObj<typeof LigneSource> = {
  render: () => (
    <LigneSource
      className="m-4"
      periode="Comptes 2025"
      sources={[{ label: "OFGL, d'après la DGFiP", url: "https://example.org" }]}
      licence="Licence Ouverte 2.0"
    />
  ),
};
