import type { Meta, StoryObj } from "@storybook/react";
import { Executif } from "./Executif";

// Fictitious people.
const NOMS = ["Sophie Bernard", "Karim Benali", "Jeanne Petit", "Marc Leroy", "Inès Faure"];

const meta: Meta<typeof Executif> = {
  title: "Territoires/Executif",
  component: Executif,
  args: {
    titre: "Vice-présidence du conseil départemental",
    rangs: NOMS.map((nom, i) => ({ rang: i + 1, nom })),
  },
};

export default meta;
type Story = StoryObj<typeof Executif>;

export const CinqRangs: Story = {};

export const SuiteRepliee: Story = {
  args: {
    rangs: [...NOMS, "Paul Durand", "Claire Martin"].map((nom, i) => ({ rang: i + 1, nom })),
  },
};
