import type { Meta, StoryObj } from "@storybook/react";
import { AffairContextBand } from "./AffairContextBand";

const meta: Meta<typeof AffairContextBand> = {
  title: "Affaires/AffairContextBand",
  component: AffairContextBand,
};

export default meta;
type Story = StoryObj<typeof AffairContextBand>;

const base = {
  politicianSlug: "jean-dupont",
  fullName: "Jean Dupont",
  photoUrl: null,
  meta: "Député du Calvados · Assemblée nationale · en mandat depuis 2017",
  affairCount: 3,
  party: {
    name: "Renaissance",
    shortName: "RE",
    color: "#ffb700",
    slug: "renaissance",
    atTime: false,
  },
  subjectLabel: null,
  subjectKind: null,
  subjectNote: null,
  involvementNote: null,
};

/** Mis en cause : bandeau d'identité simple, sans étage de rôle. */
export const MisEnCause: Story = {
  args: { ...base, involvement: "DIRECT" },
};

/** Non mis en cause : étage de rôle avec la phrase générique. */
export const Mentionne: Story = {
  args: { ...base, involvement: "MENTIONED_ONLY" },
};

/** Sujet tiers renseigné : deux colonnes « Visé » / « Suivi » + note sourcée. */
export const SujetTiers: Story = {
  args: {
    ...base,
    involvement: "MENTIONED_ONLY",
    subjectLabel: "Lagardère News",
    subjectKind: "ORGANISATION",
    subjectNote: "Groupe de presse, propriété de Vincent Bolloré",
    involvementNote:
      "Président de la commission d'enquête visée ; a reçu et rejeté les sollicitations.",
  },
};
