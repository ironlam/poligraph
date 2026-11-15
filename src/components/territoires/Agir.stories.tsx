import type { Meta, StoryObj } from "@storybook/react";
import { Agir } from "./Agir";

const meta: Meta<typeof Agir> = {
  title: "Territoires/Agir",
  component: Agir,
  args: { departmentCode: "35" },
};

export default meta;
type Story = StoryObj<typeof Agir>;

export const Commune: Story = {};
