import type { Meta, StoryObj } from "@storybook/react";
import { Breadcrumb } from "./Breadcrumb";

const meta: Meta<typeof Breadcrumb> = {
  title: "UI/Breadcrumb",
  component: Breadcrumb,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof Breadcrumb>;

export const Default: Story = {
  args: {
    items: [{ label: "Députés", href: "/deputes" }, { label: "Jean Dupont" }],
  },
};

export const DeepPath: Story = {
  args: {
    items: [
      { label: "Parlement", href: "/parlement" },
      { label: "Votes", href: "/parlement/votes" },
      { label: "Scrutin n° 1234" },
    ],
  },
};
