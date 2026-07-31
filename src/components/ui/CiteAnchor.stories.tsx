import type { Meta, StoryObj } from "@storybook/react";
import { CiteAnchor } from "./CiteAnchor";
import { Toaster } from "./sonner";

const meta: Meta<typeof CiteAnchor> = {
  title: "UI/CiteAnchor",
  component: CiteAnchor,
};

export default meta;
type Story = StoryObj<typeof CiteAnchor>;

// Revealed on hover / focus of the parent `group` (always visible on touch).
export const OnHover: Story = {
  render: () => (
    <div className="group flex items-center gap-2">
      <span className="font-medium">Scrutin n° 1234</span>
      <CiteAnchor anchorId="scrutin-1234" label="le scrutin n° 1234" />
      <span className="text-xs text-muted-foreground">(survole ou tabule)</span>
      <Toaster />
    </div>
  ),
};

export const AlwaysVisible: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <span className="font-medium">Affaire AF-000167</span>
      <CiteAnchor
        permalink="https://poligraph.fr/affaires/af-000167"
        label="l'affaire AF-000167"
        className="opacity-100"
      />
      <Toaster />
    </div>
  ),
};
