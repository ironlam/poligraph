import type { Meta, StoryObj } from "@storybook/react";
import { InfoTooltip } from "./info-tooltip";
import { TooltipProvider } from "./tooltip";

const meta: Meta<typeof InfoTooltip> = {
  title: "UI/InfoTooltip",
  component: InfoTooltip,
  decorators: [
    (Story) => (
      <TooltipProvider>
        <Story />
      </TooltipProvider>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof InfoTooltip>;

export const FromGlossary: Story = {
  args: { term: "sursis" },
};

export const CustomText: Story = {
  args: { text: "Concordance : part des scrutins où le vote coïncide avec le tien." },
};

export const Inline: Story = {
  render: () => (
    <p className="text-sm">
      Peine avec sursis
      <InfoTooltip term="sursis" />
    </p>
  ),
};
