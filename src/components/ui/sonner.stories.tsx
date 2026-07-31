import type { Meta, StoryObj } from "@storybook/react";
import { toast } from "sonner";
import { Toaster } from "./sonner";
import { Button } from "./button";

const meta: Meta<typeof Toaster> = {
  title: "UI/Toaster (sonner)",
  component: Toaster,
};

export default meta;
type Story = StoryObj<typeof Toaster>;

export const Default: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Toaster />
      <Button variant="outline" onClick={() => toast.success("Lien copié")}>
        Succès
      </Button>
      <Button variant="outline" onClick={() => toast.error("Impossible de copier le lien")}>
        Erreur
      </Button>
      <Button
        variant="outline"
        onClick={() => toast("Brouillon enregistré", { description: "À dimanche pour le récap." })}
      >
        Avec description
      </Button>
    </div>
  ),
};
