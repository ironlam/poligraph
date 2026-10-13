import type { Meta, StoryObj } from "@storybook/react";
import { BRAND_NAVY } from "@/config/brand";
import { BandeauSearch } from "./BandeauSearch";

const meta: Meta<typeof BandeauSearch> = {
  title: "UI/BandeauSearch",
  component: BandeauSearch,
  args: {
    action: "/affaires",
    id: "affaires-q",
    label: "Rechercher une affaire",
    placeholder: "Nom, mot-clé",
  },
  decorators: [
    (Story) => (
      <div className="max-w-xl p-6" style={{ backgroundColor: BRAND_NAVY }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof BandeauSearch>;

export const Affaires: Story = {};
