import type { Meta, StoryObj } from "@storybook/react";
import { QualifiedEmptyCell, type MeasureAbsence } from "./QualifiedEmptyCell";

const meta: Meta<typeof QualifiedEmptyCell> = {
  title: "Measures/QualifiedEmptyCell",
  component: QualifiedEmptyCell,
};
export default meta;

type Story = StoryObj<typeof QualifiedEmptyCell>;

const ALL: MeasureAbsence[] = [
  {
    kind: "no_vote_identified",
    checkedAt: new Date("2026-08-04T00:00:00Z"),
    scope: "à l'Assemblée, législatures 16 et 17",
  },
  { kind: "never_sat" },
  { kind: "never_held_office" },
  { kind: "no_measure_published", theme: "LOGEMENT_URBANISME" },
  { kind: "not_reviewed" },
  { kind: "insufficient_context" },
  { kind: "not_applicable", reason: "Le sujet ne concerne pas cette candidature" },
];

export const NoVoteIdentified: Story = { args: { absence: ALL[0] } };
export const NeverSat: Story = { args: { absence: ALL[1] } };
export const NoMeasurePublished: Story = { args: { absence: ALL[3] } };
export const NotApplicable: Story = { args: { absence: ALL[6] } };

export const AllVariants: Story = {
  render: () => (
    <ul className="space-y-2">
      {ALL.map((absence) => (
        <li key={absence.kind}>
          <QualifiedEmptyCell absence={absence} />
        </li>
      ))}
    </ul>
  ),
};
