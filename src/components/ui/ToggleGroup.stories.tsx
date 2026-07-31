import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { ToggleGroup } from "./ToggleGroup";

const meta: Meta<typeof ToggleGroup> = {
  title: "UI/ToggleGroup",
  component: ToggleGroup,
};

export default meta;
type Story = StoryObj<typeof ToggleGroup>;

function Demo() {
  const [value, setValue] = useState("tous");
  return (
    <ToggleGroup
      label="Filtrer par chambre"
      value={value}
      onChange={setValue}
      options={[
        { value: "tous", label: "Tous" },
        { value: "an", label: "Assemblée" },
        { value: "senat", label: "Sénat" },
      ]}
    />
  );
}

export const Default: Story = {
  render: () => <Demo />,
};
