import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CandidatesListClient, type CandidateRowView } from "../CandidatesListClient";

type ActionResult = { ok: true } | { ok: false; message: string };

const setCandidacyPublicationMock = vi.fn<(input: unknown) => Promise<ActionResult>>(async () => ({
  ok: true,
}));
const setProgramEditionPublicationMock = vi.fn<(input: unknown) => Promise<ActionResult>>(
  async () => ({ ok: true })
);

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("../actions", () => ({
  setCandidacyPublicationAction: (input: unknown) => setCandidacyPublicationMock(input),
  setProgramEditionPublicationAction: (input: unknown) => setProgramEditionPublicationMock(input),
}));

function row(over: Partial<CandidateRowView> = {}): CandidateRowView {
  return {
    candidacyId: "cand-1",
    candidateName: "Alix Démonstration",
    politicianSlug: "alix-demonstration",
    partyLabel: "PD",
    status: "DECLARE",
    sourced: true,
    presidentialId: "pres-1",
    publicationStatus: "DRAFT",
    slogan: null,
    rank: null,
    readiness: { measureCount: 26, themesCoveredCount: 11, primarySourceMeasureCount: 26 },
    editions: [
      { id: "ed-1", label: "Premiers engagements", version: 1, publicationStatus: "DRAFT" },
    ],
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CandidatesListClient", () => {
  it("nomme les candidatures qui retiennent des mesures prêtes", () => {
    // Le signal qui manquait : une fois toutes les mesures publiées, la file de modération se vide
    // et plus rien ne disait que la candidature elle-même les gardait invisibles.
    render(<CandidatesListClient rows={[row()]} />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "1 candidature retient des mesures prêtes"
    );
    expect(screen.getByRole("status")).toHaveTextContent("Alix Démonstration");
  });

  it("ne signale rien quand la fiche est déjà publiée", () => {
    render(<CandidatesListClient rows={[row({ publicationStatus: "PUBLISHED" })]} />);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dépublier" })).toBeInTheDocument();
  });

  it("publie la fiche depuis la liste", async () => {
    const user = userEvent.setup();
    render(<CandidatesListClient rows={[row()]} />);

    await user.click(screen.getByRole("button", { name: "Publier la fiche" }));

    expect(setCandidacyPublicationMock).toHaveBeenCalledWith({
      candidacyId: "cand-1",
      status: "PUBLISHED",
    });
  });

  it("publie une édition de programme depuis la liste", async () => {
    const user = userEvent.setup();
    render(<CandidatesListClient rows={[row()]} />);

    await user.click(
      screen.getByRole("button", {
        name: "Publier l'édition Premiers engagements de Alix Démonstration",
      })
    );

    expect(setProgramEditionPublicationMock).toHaveBeenCalledWith({
      programEditionId: "ed-1",
      status: "PUBLISHED",
    });
  });

  it("bloque la publication d'une candidature non sourcée et dit pourquoi", () => {
    render(<CandidatesListClient rows={[row({ sourced: false })]} />);

    expect(screen.getByRole("button", { name: "Publier la fiche" })).toBeDisabled();
    expect(screen.getByText("Statut et source obligatoires")).toBeInTheDocument();
  });

  it("affiche l'échec d'une action au lieu de le taire", async () => {
    setCandidacyPublicationMock.mockResolvedValueOnce({
      ok: false,
      message: "La candidature doit porter un statut et une source.",
    });
    const user = userEvent.setup();
    render(<CandidatesListClient rows={[row()]} />);

    await user.click(screen.getByRole("button", { name: "Publier la fiche" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "La candidature doit porter un statut et une source."
    );
  });

  it("garde une cellule qualifiée quand une candidature n'a ni mesure ni métadonnées", () => {
    render(
      <CandidatesListClient
        rows={[
          row({
            presidentialId: null,
            publicationStatus: null,
            readiness: { measureCount: 0, themesCoveredCount: 0, primarySourceMeasureCount: 0 },
            editions: [],
          }),
        ]}
      />
    );

    expect(screen.getByText("Aucune")).toBeInTheDocument();
    expect(screen.getByText("Métadonnées absentes")).toBeInTheDocument();
    expect(screen.getByText("Aucune édition")).toBeInTheDocument();
  });
});
