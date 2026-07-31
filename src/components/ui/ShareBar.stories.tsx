import type { Meta, StoryObj } from "@storybook/react";
import { ShareBar } from "./ShareBar";
import { Toaster } from "./sonner";

const meta: Meta<typeof ShareBar> = {
  title: "UI/ShareBar",
  component: ShareBar,
  parameters: { layout: "fullscreen" },
};

export default meta;
type Story = StoryObj<typeof ShareBar>;

// ShareBar is position:fixed (vertical bar ≥ 2xl, horizontal bar on mobile).
export const Default: Story = {
  render: () => (
    <div className="min-h-[60vh] p-6 text-sm text-muted-foreground">
      Barre de partage ancrée (bas sur mobile, colonne à gauche en très large).
      <Toaster />
      <ShareBar
        data={{
          title: "Ma Boussole Parlementaire",
          text: "Découvre quels élus votent comme toi",
          url: "https://poligraph.fr",
        }}
      />
    </div>
  ),
};
