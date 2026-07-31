import type { Meta, StoryObj } from "@storybook/react";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableCaption,
} from "./table";
import { Badge } from "./badge";

const meta: Meta<typeof Table> = {
  title: "UI/Table",
  component: Table,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof Table>;

const ROWS = [
  { nom: "Jean Dupont", groupe: "RE", votes: 412, statut: "default" as const },
  { nom: "Marie Martin", groupe: "LFI", votes: 388, statut: "secondary" as const },
  { nom: "Paul Bernard", groupe: "LR", votes: 401, statut: "outline" as const },
];

export const Default: Story = {
  render: () => (
    <Table>
      <TableCaption>Participation aux scrutins (législature en cours)</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Député</TableHead>
          <TableHead>Groupe</TableHead>
          <TableHead className="text-right">Votes</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {ROWS.map((r) => (
          <TableRow key={r.nom}>
            <TableCell className="font-medium">{r.nom}</TableCell>
            <TableCell>
              <Badge variant={r.statut}>{r.groupe}</Badge>
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {r.votes.toLocaleString("fr-FR")}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  ),
};
