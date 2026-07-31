import type { Meta, StoryObj } from "@storybook/react";
import { Textarea } from "./textarea";

const meta: Meta<typeof Textarea> = {
  title: "UI/Textarea",
  component: Textarea,
  argTypes: {
    disabled: { control: "boolean" },
  },
};

export default meta;
type Story = StoryObj<typeof Textarea>;

export const Default: Story = {
  args: {
    placeholder:
      "Ajoutez un commentaire ou une source complémentaire sur cette affaire judiciaire...",
  },
};

export const WithValue: Story = {
  args: {
    defaultValue:
      "Cette affaire a fait l'objet d'un non-lieu prononcé par le tribunal correctionnel de Paris le 12 janvier 2025. Source : Le Monde, AFP.",
    "aria-label": "Commentaire de modération",
  },
};

export const Disabled: Story = {
  args: {
    placeholder: "Les commentaires sont désactivés pour cette fiche.",
    disabled: true,
  },
};
