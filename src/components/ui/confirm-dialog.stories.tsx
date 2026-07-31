import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { ConfirmDialog } from "./confirm-dialog";
import { Button } from "./button";

const meta: Meta<typeof ConfirmDialog> = {
  title: "UI/ConfirmDialog",
  component: ConfirmDialog,
};

export default meta;
type Story = StoryObj<typeof ConfirmDialog>;

function Demo({ variant }: { variant?: "default" | "destructive" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant={variant === "destructive" ? "destructive" : "default"}
        onClick={() => setOpen(true)}
      >
        {variant === "destructive" ? "Supprimer" : "Confirmer l'action"}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        onConfirm={() => setOpen(false)}
        variant={variant}
        title={variant === "destructive" ? "Supprimer définitivement ?" : "Confirmer ?"}
        description={
          variant === "destructive"
            ? "Cette action est irréversible."
            : "Merci de confirmer que tu souhaites poursuivre."
        }
      />
    </>
  );
}

export const Default: Story = { render: () => <Demo /> };
export const Destructive: Story = { render: () => <Demo variant="destructive" /> };
