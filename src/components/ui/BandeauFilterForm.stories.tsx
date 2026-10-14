import type { Meta, StoryObj } from "@storybook/react";
import { BRAND_NAVY } from "@/config/brand";
import { BandeauFilterForm } from "./BandeauFilterForm";

const meta: Meta<typeof BandeauFilterForm> = {
  title: "UI/BandeauFilterForm",
  component: BandeauFilterForm,
  args: {
    action: "/affaires",
    idPrefix: "affaires",
    searchPlaceholder: "Nom, mot-clé",
    selects: [
      {
        name: "certainty",
        label: "Certitude",
        options: [
          { value: "", label: "Toutes" },
          { value: "ETABLI", label: "Condamnation définitive (50)" },
        ],
      },
      {
        name: "supercat",
        label: "Catégorie",
        options: [
          { value: "", label: "Toutes" },
          { value: "PROBITE", label: "Atteintes à la probité (102)" },
        ],
      },
      { name: "parti", label: "Parti", options: [{ value: "", label: "Tous les partis" }] },
      { name: "sort", label: "Trier", options: [{ value: "", label: "Plus récentes" }] },
    ],
  },
  decorators: [
    (Story) => (
      <div className="max-w-4xl p-6" style={{ backgroundColor: BRAND_NAVY }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof BandeauFilterForm>;

export const Affaires: Story = {};
