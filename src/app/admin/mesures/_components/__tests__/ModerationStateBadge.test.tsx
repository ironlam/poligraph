import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ModerationState } from "@/lib/measures/moderation-state";
import { ModerationStateBadge } from "../ModerationStateBadge";

function state(over: Partial<ModerationState> = {}): ModerationState {
  return {
    publication: "DRAFT",
    declaredStatus: "DRAFT",
    publiclyVisible: false,
    visibilityBlockers: ["status_not_published"],
    withdrawal: null,
    depublication: null,
    activeDraft: null,
    draftIsCorrection: false,
    anomalies: [],
    ...over,
  };
}

const PUBLISHED = {
  publication: "PUBLISHED",
  declaredStatus: "PUBLISHED",
  publiclyVisible: true,
  visibilityBlockers: [],
} satisfies Partial<ModerationState>;

describe("ModerationStateBadge", () => {
  it("rend l'étape du cycle", () => {
    render(<ModerationStateBadge state={state({ publication: "REVIEWED" })} />);

    expect(screen.getByText("Relue")).toBeInTheDocument();
  });

  it("ne crie rien sur une mesure publiée et visible", () => {
    render(<ModerationStateBadge state={state(PUBLISHED)} />);

    expect(screen.getByText("Publiée")).toBeInTheDocument();
    expect(screen.queryByText(/invisible du public/i)).not.toBeInTheDocument();
  });

  it("signale une mesure publiée que le public ne voit pas", () => {
    // The pair that matters: the stage says published, the visibility says otherwise, and both
    // have to be on screen at once.
    render(
      <ModerationStateBadge
        state={state({
          ...PUBLISHED,
          publiclyVisible: false,
          visibilityBlockers: ["revision_without_source"],
        })}
      />
    );

    expect(screen.getByText("Publiée")).toBeInTheDocument();
    expect(screen.getByText("Publiée mais invisible du public")).toBeInTheDocument();
  });

  it("distingue un retrait sourcé d'un retrait incomplet", () => {
    const { unmount } = render(
      <ModerationStateBadge
        state={state({
          ...PUBLISHED,
          withdrawal: {
            withdrawnAt: new Date("2027-03-01T00:00:00Z"),
            sourceUrl: "https://example.org/retrait",
            sourceLabel: "Conférence de presse",
          },
        })}
      />
    );
    expect(screen.getByText("Retirée, sourcée")).toBeInTheDocument();
    unmount();

    render(
      <ModerationStateBadge
        state={state({
          ...PUBLISHED,
          withdrawal: {
            withdrawnAt: new Date("2027-03-01T00:00:00Z"),
            sourceUrl: null,
            sourceLabel: null,
          },
        })}
      />
    );
    expect(screen.getByText("Retirée, source incomplète")).toBeInTheDocument();
  });

  it("montre la correction en cours au lieu de la cacher derrière l'étape", () => {
    render(
      <ModerationStateBadge
        state={state({
          ...PUBLISHED,
          activeDraft: { id: "rev-2", reviewed: true },
          draftIsCorrection: true,
        })}
      />
    );

    expect(screen.getByText("Correction relue en attente")).toBeInTheDocument();
  });

  it("distingue une correction relue d'une correction en cours", () => {
    render(
      <ModerationStateBadge
        state={state({
          ...PUBLISHED,
          activeDraft: { id: "rev-2", reviewed: false },
          draftIsCorrection: true,
        })}
      />
    );

    expect(screen.getByText("Correction en cours")).toBeInTheDocument();
  });

  it("accorde le compteur d'anomalies", () => {
    const { unmount } = render(
      <ModerationStateBadge
        state={state({ anomalies: [{ code: "orphan_active_draft", detail: "rev-3" }] })}
      />
    );
    expect(screen.getByText("1 anomalie")).toBeInTheDocument();
    unmount();

    render(
      <ModerationStateBadge
        state={state({
          anomalies: [
            { code: "orphan_active_draft", detail: "rev-3" },
            { code: "withdrawn_without_source", detail: "m-1" },
          ],
        })}
      />
    );
    expect(screen.getByText("2 anomalies")).toBeInTheDocument();
  });

  it("affiche un statut en base que les transitions n'écrivent jamais", () => {
    render(<ModerationStateBadge state={state({ declaredStatus: "EXCLUDED" })} />);

    expect(screen.getByText("Statut en base : Exclu")).toBeInTheDocument();
  });
});
