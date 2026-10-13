import type { Meta, StoryObj } from "@storybook/react";
import { BRAND_NAVY } from "@/config/brand";
import { HemicycleDecor } from "./HemicycleDecor";

const meta: Meta<typeof HemicycleDecor> = {
  title: "UI/HemicycleDecor",
  component: HemicycleDecor,
  decorators: [
    (Story) => (
      <div className="max-w-md p-6" style={{ backgroundColor: BRAND_NAVY }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof HemicycleDecor>;

export const SurBandeau: Story = {};
