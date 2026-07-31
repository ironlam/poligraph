import type { Meta, StoryObj } from "@storybook/react";
import { HexPattern } from "./HexPattern";

const meta: Meta<typeof HexPattern> = {
  title: "UI/HexPattern",
  component: HexPattern,
};

export default meta;
type Story = StoryObj<typeof HexPattern>;

export const OnNavy: Story = {
  render: () => (
    <div className="relative h-48 w-80 overflow-hidden rounded-lg bg-primary text-primary-foreground">
      <HexPattern className="absolute inset-0 text-white/15" />
      <div className="relative p-4 font-display text-lg">Motif hexagonal</div>
    </div>
  ),
};

export const Subtle: Story = {
  render: () => (
    <div className="relative h-48 w-80 overflow-hidden rounded-lg border bg-background">
      <HexPattern className="absolute inset-0 text-muted-foreground/10" />
      <div className="relative p-4 text-sm text-muted-foreground">Fond discret (hero / footer)</div>
    </div>
  ),
};
