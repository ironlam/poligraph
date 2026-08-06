import type { Meta, StoryObj } from "@storybook/react";
import type { VoteRelation } from "@/lib/measures/vote-relation";
import { VoteRelationBadge } from "./VoteRelationBadge";

const meta: Meta<typeof VoteRelationBadge> = {
  title: "Measures/VoteRelationBadge",
  component: VoteRelationBadge,
};
export default meta;

type Story = StoryObj<typeof VoteRelationBadge>;

const ALL: VoteRelation[] = [
  "FAVORABLE_SAME_OBJECT",
  "DEFAVORABLE_SAME_OBJECT",
  "ABSTENTION_SAME_OBJECT",
  "ABSENCE_SAME_OBJECT",
  "DIFFERENT_POSITIONS",
  "BROADER_TEXT",
  "NOT_RECHECKED_SINCE_REFORMULATION",
  "NO_VOTE_IN_SCOPE",
  "SEARCH_NOT_DONE",
];

export const Favorable: Story = {
  args: {
    relation: "FAVORABLE_SAME_OBJECT",
    basisDetails: "scrutin no 1234, Assemblée, législature 17, vérifié le 4 août 2026",
  },
};

export const AllStates: Story = {
  render: () => (
    <ul className="space-y-3">
      {ALL.map((relation) => (
        <li key={relation}>
          <VoteRelationBadge relation={relation} />
        </li>
      ))}
    </ul>
  ),
};
