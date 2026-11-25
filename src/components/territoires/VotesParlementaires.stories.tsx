import type { Meta, StoryObj } from "@storybook/react";
import type { VotesDeputes } from "@/lib/data/territoire-votes";
import { VotesParlementaires } from "./VotesParlementaires";

// Fictitious scrutins, as in every Territoires mock-up.
const votes: VotesDeputes = {
  deputeSlugs: ["claire-exemple"],
  scrutins: [
    {
      slug: "2026-11-19-scrutin-1",
      titre:
        "l'ensemble de la proposition de loi visant à lutter contre la vie chère en renforçant le droit de la concurrence et de la régulation économique outre-mer (première lecture).",
      nature: "Texte final",
      resultat: "Adopté",
      adopte: true,
      date: "2026-11-19",
      positions: { "claire-exemple": "POUR" },
      sansVote: [],
    },
    {
      slug: "2026-11-18-scrutin-2",
      titre: "la motion de censure déposée en application de l'article 49, alinéa 2.",
      nature: "Motion",
      resultat: "Rejeté",
      adopte: false,
      date: "2026-11-18",
      positions: { "claire-exemple": "CONTRE" },
      sansVote: [],
    },
  ],
};

const meta: Meta<typeof VotesParlementaires> = {
  title: "Territoires/VotesParlementaires",
  component: VotesParlementaires,
  args: { votes, mode: { kind: "renvoi" } },
  decorators: [
    (Story) => (
      <div className="territoire-lecture w-[390px] max-w-full px-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof VotesParlementaires>;

export const CommuneSansDeputeEtabli: Story = {};

export const CommuneAvecDepute: Story = {
  args: {
    mode: { kind: "depute", depute: { slug: "claire-exemple", fullName: "Claire Exemple" } },
  },
};

export const Departement: Story = { args: { mode: { kind: "decompte" } } };
