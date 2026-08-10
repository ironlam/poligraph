import type { Meta, StoryObj } from "@storybook/react";
import { MissingData } from "./MissingData";

const meta: Meta<typeof MissingData> = {
  title: "UI/MissingData",
  component: MissingData,
};

export default meta;
type Story = StoryObj<typeof MissingData>;

/**
 * Cas « non publiée » : l'autorité n'a pas rendu la donnée publique. L'état vide la
 * nomme, et le ton reste factuel : « aucune déclaration publiée », pas « n'a pas
 * déclaré ».
 */
export const NotPublished: Story = {
  args: {
    title: "Aucune déclaration publiée",
    children: "La HATVP n'a pas publié de déclaration de patrimoine pour ce mandat.",
  },
};

/**
 * Cas « inconnue » : la donnée existe mais nous ne l'avons pas. On dit ce qui manque,
 * pourquoi, et où chercher.
 */
export const Unknown: Story = {
  args: {
    title: "Les candidatures ne sont pas publiées en open data",
    children:
      "Aucun jeu de données national ne recense les candidats au Sénat : les listes sont arrêtées par chaque préfecture. Nous les saisissons département par département.",
  },
};

// Sans titre, quand le corps porte tout le message.
export const BodyOnly: Story = {
  args: {
    children:
      "Il manque la population municipale ou l'effectif du conseil pour appliquer le barème. Nous ne l'estimons pas.",
  },
};

// Un symbole Unicode discret est admis. Jamais d'emoji, jamais d'illustration.
export const WithGlyph: Story = {
  args: {
    glyph: "◦",
    title: "Série de renouvellement inconnue",
    children:
      "Nous ne savons pas si les sièges de ce département sont remis en jeu cette année. La série est reprise de l'open data du Sénat.",
  },
};

/**
 * Le piège que ce composant existe pour éviter : à gauche une absence dite, à droite
 * un zéro qui se lit comme un fait. « 0 délégué » est une information ; « inconnu »
 * est une lacune, et les deux ne doivent jamais se rendre pareil.
 */
export const AgainstAFalseZero: Story = {
  render: () => (
    <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
      <MissingData title="Nombre de délégués inconnu">
        Il manque la population municipale pour appliquer le barème.
      </MissingData>
      <div className="rounded-md border border-border p-4">
        <p className="text-xs text-muted-foreground">grands électeurs</p>
        <p className="font-display text-xl font-extrabold tabular-nums">0</p>
        <p className="mt-1 text-xs text-muted-foreground">
          À ne pas faire pour une valeur absente.
        </p>
      </div>
    </div>
  ),
};
