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

/** A code outside the reference: the block keeps its fixed text and names no court. */
export const SansTribunal: Story = { args: { departmentCode: "99" } };
