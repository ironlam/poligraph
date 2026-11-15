import type { Meta, StoryObj } from "@storybook/react";
import { CompositionConseil } from "./CompositionConseil";

const meta: Meta<typeof CompositionConseil> = {
  title: "Territoires/CompositionConseil",
  component: CompositionConseil,
  args: {
    source: { label: "Ministère de l'Intérieur, résultats des élections municipales 2026" },
    // Fictitious lists.
    composition: {
      total: 61,
      parts: [
        { label: "Liste conduite par Sophie Bernard", sieges: 44, ton: 0 },
        { label: "Liste conduite par Karim Benali", sieges: 11, ton: 1 },
        { label: "Liste conduite par Jeanne Petit", sieges: 6, ton: 2 },
      ],
    },
  },
};

export default meta;
type Story = StoryObj<typeof CompositionConseil>;

export const TroisListes: Story = {};

export const ListeUnique: Story = {
  args: {
    composition: { total: 15, parts: [{ label: "Agir pour le village", sieges: 15, ton: 0 }] },
  },
};

export const AutresListes: Story = {
  args: {
    composition: {
      total: 55,
      parts: [
        {
          label: "Un nom de liste très long pour vérifier le retour à la ligne sur mobile",
          sieges: 42,
          ton: 0,
        },
        { label: "Une ville en commun", sieges: 5, ton: 1 },
        { label: "Un souffle nouveau", sieges: 4, ton: 2 },
        { label: "2 autres listes", sieges: 4, ton: "autres" },
      ],
    },
  },
};
