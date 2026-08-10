import type { Meta, StoryObj } from "@storybook/react";
import { SourceLine } from "./SourceLine";

const meta: Meta<typeof SourceLine> = {
  title: "UI/SourceLine",
  component: SourceLine,
};

export default meta;
type Story = StoryObj<typeof SourceLine>;

export const OneSource: Story = {
  args: {
    sources: [{ label: "Sénat", url: "https://senatoriales2026.senat.fr/" }],
    consultedAt: new Date("2026-08-10"),
  },
};

export const SeveralSources: Story = {
  args: {
    sources: [
      { label: "Décret n° 2026-301 du 21 avril 2026", url: "https://www.legifrance.gouv.fr/" },
      { label: "Sénat", url: "https://senatoriales2026.senat.fr/" },
      { label: "Code électoral, art. L. 280 à L. 293", url: "https://www.legifrance.gouv.fr/" },
    ],
    note: "Répartition du collège publiée par le Sénat",
    consultedAt: new Date("2026-08-10"),
  },
};

// A source with no stable public URL renders as text, not as a dead link.
export const WithoutLink: Story = {
  args: {
    sources: [{ label: "Arrêté préfectoral" }, { label: "Sénat", url: "https://www.senat.fr/" }],
    consultedAt: new Date("2026-08-10"),
  },
};

/**
 * No consultation date available. The mention disappears entirely rather than
 * rendering an empty value: `formatDate(null)` would print a dash, and "Vérifié"
 * without a date is an unverifiable claim on a verification platform.
 */
export const Undated: Story = {
  args: {
    sources: [
      {
        label: "Population municipale (INSEE), via geo.api.gouv.fr",
        url: "https://geo.api.gouv.fr/decoupage-administratif/communes",
      },
    ],
    note: "Date d'import du référentiel communal non enregistrée",
    consultedAt: null,
  },
};

// Inside a block, at the size and colour it ships at.
export const InContext: Story = {
  render: () => (
    <div className="max-w-2xl space-y-3 rounded-xl border border-border p-4">
      <p className="font-semibold">178 sièges sur 348 sont renouvelés</p>
      <p className="text-sm text-muted-foreground">
        Dans 64 circonscriptions : 63 départements et collectivités, plus les Français établis hors
        de France.
      </p>
      <SourceLine
        sources={[
          { label: "Décret n° 2026-301 du 21 avril 2026", url: "https://www.legifrance.gouv.fr/" },
          { label: "Sénat", url: "https://senatoriales2026.senat.fr/" },
        ]}
        consultedAt={new Date("2026-08-10")}
      />
    </div>
  ),
};
