import type { Meta, StoryObj } from "@storybook/react";
import { Input } from "./input";

const meta: Meta<typeof Input> = {
  title: "UI/Input",
  component: Input,
  argTypes: {
    type: {
      control: "select",
      options: ["text", "email", "password", "search", "number"],
    },
    disabled: { control: "boolean" },
  },
};

export default meta;
type Story = StoryObj<typeof Input>;

export const Default: Story = {
  args: { placeholder: "Rechercher un politicien..." },
};

export const Search: Story = {
  args: { type: "search", placeholder: "Rechercher par nom, parti ou département..." },
};

export const WithValue: Story = {
  args: { defaultValue: "Jean-Luc Mélenchon", "aria-label": "Nom recherché" },
};

export const Disabled: Story = {
  args: { placeholder: "Recherche indisponible", disabled: true },
};

export const Email: Story = {
  args: { type: "email", placeholder: "votre@email.fr" },
};
