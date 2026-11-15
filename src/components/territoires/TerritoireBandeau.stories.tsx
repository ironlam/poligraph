import type { Meta, StoryObj } from "@storybook/react";
import { TerritoireBandeau } from "./TerritoireBandeau";

// Fictitious data: invented places and people.
const meta: Meta<typeof TerritoireBandeau> = {
  title: "Territoires/TerritoireBandeau",
  component: TerritoireBandeau,
  parameters: { layout: "fullscreen" },
  args: {
    titreId: "bandeau-titre",
    filAriane: [
      { label: "Territoires", href: "/territoires" },
      { label: "Exemplie", href: "/territoires/regions/exemplie" },
      { label: "Haute-Exemple (99)", href: "/territoires/departements/haute-exemple" },
      { label: "Saint-Exemple" },
    ],
    nom: "Saint-Exemple",
    code: "99019",
    identite: "Commune · Code INSEE 99019 · codes postaux 99000, 99100",
    phrase: [
      { text: "Claire Martin", href: "/politiques/claire-martin" },
      { text: " est maire depuis le 22 mars 2026." },
    ],
    source: "Source : Répertoire National des Élus",
    faits: [
      {
        label: "Population",
        valeur: "142 346",
        legende: "habitants. Population municipale 2023, en vigueur au 1er janvier 2026 (INSEE)",
        legendeCourte: "habitants en 2023 (INSEE)",
        sourceHref: "https://www.insee.fr",
      },
      {
        label: "Conseil municipal",
        valeur: "55",
        legende:
          "élus au conseil municipal. Répertoire national des élus, registre du 3 novembre 2026",
        legendeCourte: "élus au conseil, registre du 3 nov. 2026",
      },
      {
        label: "Parlement",
        valeur: "2e circonscription",
        valeurCourte: "2e circ.",
        legende: "Député : Paul Durand",
      },
    ],
    action: { label: "Changer de commune", href: "/territoires" },
  },
};

export default meta;
type Story = StoryObj<typeof TerritoireBandeau>;

export const MaireEtabli: Story = {};
