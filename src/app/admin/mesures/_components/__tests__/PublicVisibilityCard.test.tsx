import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PublicMeasure } from "@/lib/data/measures";
import type { ModerationState } from "@/lib/measures/moderation-state";
import { PublicVisibilityCard } from "../PublicVisibilityCard";

function state(over: Partial<ModerationState> = {}): ModerationState {
  return {
    publication: "PUBLISHED",
    declaredStatus: "PUBLISHED",
    publiclyVisible: true,
    visibilityBlockers: [],
    withdrawal: null,
    depublication: null,
    activeDraft: null,
    draftIsCorrection: false,
    anomalies: [],
    ...over,
  };
}

function publicMeasure(over: Partial<PublicMeasure> = {}): PublicMeasure {
  return {
    id: "m-1",
    slug: "camille-riviere-encadrer-les-loyers",
    publishedRevisionId: "rev-1",
    text: "Encadrer les loyers dans les zones tendues.",
    details:
      "Selon la source citée, cette mesure cible les communes où la demande de logements dépasse l'offre disponible.",
    reviewedAt: new Date("2027-01-16T00:00:00Z"),
    precision: "OBJECTIF_SANS_CHIFFRE",
    theme: "LOGEMENT_URBANISME",
    attribution: "PERSONAL",
    politicianId: "p-1",
    candidacyId: "c-1",
    programEditionId: null,
    withdrawal: null,
    sources: [
      {
        id: "s-1",
        measureRevisionId: "rev-1",
        sourceKind: "PROGRAMME_PARTI",
        tier: "PRIMARY",
        url: "https://example.org/programme.pdf",
        page: "12",
        publishedAt: new Date("2027-01-15T00:00:00Z"),
        createdAt: new Date("2027-01-16T00:00:00Z"),
      },
    ],
    qualifications: [],
    subtopics: [],
    ...over,
  };
}

describe("PublicVisibilityCard", () => {
  it("rend le texte et les sources que le public reçoit", () => {
    render(<PublicVisibilityCard state={state()} publicMeasure={publicMeasure()} />);

    expect(screen.getByText("Encadrer les loyers dans les zones tendues.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Contexte publié" })).toBeInTheDocument();
    expect(screen.getByText(/cette mesure cible les communes/)).toBeInTheDocument();
    expect(screen.getByText("1 source citée")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Programme de parti" })).toHaveAttribute(
      "href",
      "https://example.org/programme.pdf"
    );
  });

  it("énumère les raisons quand la lecture publique ne renvoie rien", () => {
    // A moderator told "invisible" without the why cannot act. One line per unmet condition.
    render(
      <PublicVisibilityCard
        state={state({
          publiclyVisible: false,
          visibilityBlockers: ["revision_unreviewed", "revision_without_source"],
        })}
        publicMeasure={null}
      />
    );

    expect(screen.getByText("Cette mesure ne sort d'aucune lecture publique.")).toBeInTheDocument();
    expect(screen.getByText("La révision désignée n'a pas été relue")).toBeInTheDocument();
    expect(screen.getByText("La révision désignée n'a aucune source")).toBeInTheDocument();
  });

  it("affiche le lien de retrait quand les deux champs de source sont là", () => {
    render(
      <PublicVisibilityCard
        state={state()}
        publicMeasure={publicMeasure({
          withdrawal: {
            withdrawnAt: new Date("2027-03-01T00:00:00Z"),
            sourceUrl: "https://example.org/retrait",
            sourceLabel: "Conférence de presse du 1er mars 2027",
          },
        })}
      />
    );

    expect(screen.getByText(/Retirée le 1 mars 2027/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Conférence de presse du 1er mars 2027" })
    ).toHaveAttribute("href", "https://example.org/retrait");
  });

  it("montre le retrait sans lien quand la source manque, au lieu de masquer le retrait", () => {
    // The arbitrated contract: the withdrawal is always displayed, the link only when both
    // source fields are there. Hiding the withdrawal to protect the missing source would state
    // that the candidate still defends the measure.
    render(
      <PublicVisibilityCard
        state={state()}
        publicMeasure={publicMeasure({
          withdrawal: {
            withdrawnAt: new Date("2027-03-01T00:00:00Z"),
            sourceUrl: null,
            sourceLabel: null,
          },
        })}
      />
    );

    expect(screen.getByText(/Retirée le 1 mars 2027/)).toBeInTheDocument();
    expect(screen.getByText(/Retrait incomplet/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Conférence/ })).not.toBeInTheDocument();
  });
});
