import type { Meta, StoryObj } from "@storybook/react";
import { FilTerritoire } from "./FilTerritoire";

// Fictitious people and events.
const RNE = {
  label: "Répertoire national des élus, ministère de l'Intérieur",
  url: "https://www.data.gouv.fr/datasets/repertoire-national-des-elus-1",
};

const meta: Meta<typeof FilTerritoire> = {
  title: "Territoires/FilTerritoire",
  component: FilTerritoire,
  args: {
    evenements: [
      {
        id: "1",
        date: "2026-10-03",
        evenement: { type: "CHANGEMENT_MAIRE", nom: "Claire Martin", predecesseur: "Paul Durand" },
        source: RNE,
      },
      {
        id: "2",
        date: "2026-07-01",
        evenement: {
          type: "CHANGEMENT_PRESIDENT",
          conseil: "DEPARTEMENTAL",
          nom: "Marc Leroy",
          predecesseur: null,
        },
        source: RNE,
      },
      {
        id: "3",
        date: "2022-04-24",
        evenement: {
          type: "RESULTAT_ELECTION",
          electionSlug: "presidentielle-2022",
          electionLabel: "Élection présidentielle 2022",
          tour: 2,
        },
        source: { label: "Ministère de l'Intérieur", url: "https://www.data.gouv.fr/" },
      },
    ],
  },
};

export default meta;
type Story = StoryObj<typeof FilTerritoire>;

export const TroisLignes: Story = {};

export const UneLigne: Story = {
  args: { evenements: meta.args!.evenements!.slice(0, 1) },
};
