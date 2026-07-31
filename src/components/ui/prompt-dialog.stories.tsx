import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { PromptDialog } from "./prompt-dialog";
import { Button } from "./button";

const meta: Meta<typeof PromptDialog> = {
  title: "UI/PromptDialog",
  component: PromptDialog,
};

export default meta;
type Story = StoryObj<typeof PromptDialog>;

function Demo() {
  const [open, setOpen] = useState(false);
  const [last, setLast] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <Button onClick={() => setOpen(true)}>Rejeter avec un motif</Button>
      {last && <p className="text-sm text-muted-foreground">Motif : {last}</p>}
      <PromptDialog
        open={open}
        onOpenChange={setOpen}
        onSubmit={(v) => {
          setLast(v);
          setOpen(false);
        }}
        title="Motif du rejet"
        description="Explique pourquoi ce brouillon est rejeté."
        placeholder="Ex : source insuffisante"
      />
    </div>
  );
}

export const Default: Story = { render: () => <Demo /> };
