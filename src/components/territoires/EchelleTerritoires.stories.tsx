import type { Meta, StoryObj } from "@storybook/react";
import { COMPETENCES_TERRITOIRES } from "@/config/territoires-competences";
import { EchelleTerritoires } from "./EchelleTerritoires";

// Fictitious places.
const meta: Meta<typeof EchelleTerritoires> = {
  title: "Territoires/EchelleTerritoires",
  component: EchelleTerritoires,
  args: {
    barreaux: [
      {
        niveau: "commune",
        titre: "Commune",
        nom: "Saint-Exemple",
        competences: COMPETENCES_TERRITOIRES.commune,
        ici: true,
      },
      {
        niveau: "intercommunalite",
        titre: "Intercommunalité",
        nom: "Exemple Métropole",
        competences: COMPETENCES_TERRITOIRES.intercommunalite,
        ici: false,
      },
      {
        niveau: "departement",
        titre: "Département",
        nom: "Haute-Exemple (99)",
        href: "/territoires/departements/haute-exemple",
        competences: COMPETENCES_TERRITOIRES.departement,
        ici: false,
      },
      {
        niveau: "region",
        titre: "Région",
        nom: "Exemplie",
        href: "/territoires/regions/exemplie",
        competences: COMPETENCES_TERRITOIRES.region,
        ici: false,
      },
    ],
  },
};

export default meta;
type Story = StoryObj<typeof EchelleTerritoires>;

export const Commune: Story = {};
