import type { Meta, StoryObj } from "@storybook/react";
import { MarkdownText } from "./markdown";

const meta: Meta<typeof MarkdownText> = {
  title: "UI/MarkdownText",
  component: MarkdownText,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof MarkdownText>;

const SAMPLE = `**Contexte du scrutin**

Le texte porte sur *l'encadrement des dépenses*. Les points clés :

- Plafonnement des niches fiscales
- Revalorisation du barème
  - avec indexation sur l'inflation
- Contrôle renforcé

Plus de détails sur la [méthodologie](/methodologie).

---

Voter POUR soutient la mesure, voter CONTRE la rejette.`;

export const Default: Story = {
  args: { children: SAMPLE },
};

export const LinksDisabled: Story = {
  args: {
    children: "Voir la [fiche du député](/deputes/jean-dupont) pour le détail.",
    disableLinks: true,
  },
};
