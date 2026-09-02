import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CandidatesListClient, type CandidateRowView } from "../CandidatesListClient";

type ActionResult = { ok: true; text?: string } | { ok: false; message: string };

const setCandidacyPublicationMock = vi.fn<(input: unknown) => Promise<ActionResult>>(async () => ({
  ok: true,
}));
const setProgramEditionPublicationMock = vi.fn<(input: unknown) => Promise<ActionResult>>(
  async () => ({ ok: true })
);
const regenerateCandidateSynthesisMock = vi.fn<(input: unknown) => Promise<ActionResult>>(
  async () => ({ ok: true, text: "Une proposition de synthèse suffisamment développée." })
);
const setCandidacyStatusMock = vi.fn<(input: unknown) => Promise<ActionResult>>(async () => ({
  ok: true,
}));
const fetchMock = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("../actions", () => ({
  setCandidacyPublicationAction: (input: unknown) => setCandidacyPublicationMock(input),
  setCandidacyStatusAction: (input: unknown) => setCandidacyStatusMock(input),
  setProgramEditionPublicationAction: (input: unknown) => setProgramEditionPublicationMock(input),
  regenerateCandidateSynthesisAction: (input: unknown) => regenerateCandidateSynthesisMock(input),
}));

function row(over: Partial<CandidateRowView> = {}): CandidateRowView {
  return {
    candidacyId: "cand-1",
    candidateName: "Alix Démonstration",
    politicianId: "pol-1",
    politicianSlug: "alix-demonstration",
    politicianPublicationStatus: "PUBLISHED",
    partyLabel: "PD",
    status: "DECLARE",
    sourceUrl: "https://example.org/annonce",
    sourceLabel: "Annonce officielle",
    sourced: true,
    presidentialId: "pres-1",
    publicationStatus: "DRAFT",
    slogan: null,
    rank: null,
    readiness: {
      measureCount: 26,
      themesCoveredCount: 11,
      primarySourceMeasureCount: 26,
      firstPublishedAt: new Date("2026-08-01T00:00:00.000Z"),
    },
    synthesisState: "CURRENT",
    synthesis: "Une synthèse existante relue par la rédaction.",
    synthesisGeneratedAt: new Date("2026-08-07T00:00:00.000Z"),
    editions: [
      { id: "ed-1", label: "Premiers engagements", version: 1, publicationStatus: "DRAFT" },
    ],
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
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
    expect(screen.getByRole("button", { name: "Dépublier la fiche" })).toBeInTheDocument();
  });

  it("signale une candidature publiée dont la personnalité reste masquée", () => {
    render(
      <CandidatesListClient
        rows={[
          row({
            publicationStatus: "PUBLISHED",
            politicianPublicationStatus: "ARCHIVED",
          }),
        ]}
      />
    );

    expect(screen.getByRole("alert")).toHaveTextContent("1 candidature publiée reste invisible");
    expect(screen.getByRole("link", { name: "Publier la personnalité" })).toHaveAttribute(
      "href",
      "/admin/politiques/pol-1"
    );
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

  it("modifie le statut politique depuis la liste", async () => {
    const user = userEvent.setup();
    render(<CandidatesListClient rows={[row({ status: "PRESSENTI" })]} />);

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Statut de Alix Démonstration" }),
      "DECLARE"
    );
    await user.clear(
      screen.getByRole("textbox", { name: "URL source du statut de Alix Démonstration" })
    );
    await user.type(
      screen.getByRole("textbox", { name: "URL source du statut de Alix Démonstration" }),
      "https://example.org/declaration"
    );
    await user.clear(
      screen.getByRole("textbox", { name: "Libellé source du statut de Alix Démonstration" })
    );
    await user.type(
      screen.getByRole("textbox", { name: "Libellé source du statut de Alix Démonstration" }),
      "Déclaration officielle"
    );
    await user.click(screen.getByRole("button", { name: "Enregistrer le statut" }));

    expect(setCandidacyStatusMock).toHaveBeenCalledWith({
      candidacyId: "cand-1",
      status: "DECLARE",
      sourceUrl: "https://example.org/declaration",
      sourceLabel: "Déclaration officielle",
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
            readiness: {
              measureCount: 0,
              themesCoveredCount: 0,
              primarySourceMeasureCount: 0,
              firstPublishedAt: null,
            },
            synthesisState: "MISSING",
            synthesis: null,
            synthesisGeneratedAt: null,
            editions: [],
          }),
        ]}
      />
    );

    expect(screen.getByText("Aucune mesure prête")).toBeInTheDocument();
    expect(screen.getByText("Fiche sans métadonnées")).toBeInTheDocument();
    expect(screen.getByText("Aucune édition de programme.")).toBeInTheDocument();
    expect(screen.getByText("Absente")).toBeInTheDocument();
  });

  it("ouvre la proposition générée sans la publier", async () => {
    const user = userEvent.setup();
    render(<CandidatesListClient rows={[row()]} />);

    await user.click(screen.getByRole("button", { name: "Générer une proposition" }));

    expect(regenerateCandidateSynthesisMock).toHaveBeenCalledWith({ candidacyId: "cand-1" });
    expect(await screen.findByLabelText("Texte public")).toHaveValue(
      "Une proposition de synthèse suffisamment développée."
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("permet de modifier puis d'enregistrer la synthèse existante", async () => {
    const user = userEvent.setup();
    render(<CandidatesListClient rows={[row()]} />);

    await user.click(screen.getByRole("button", { name: "Modifier le texte" }));
    const editor = screen.getByLabelText("Texte public");
    expect(editor).toHaveValue("Une synthèse existante relue par la rédaction.");
    await user.clear(editor);
    await user.type(
      editor,
      "Cette synthèse corrigée présente les principaux axes du programme documenté et leurs moyens."
    );
    await user.click(screen.getByRole("button", { name: "Enregistrer la synthèse" }));

    expect(fetchMock).toHaveBeenCalledWith("/api/admin/candidats/cand-1/synthesis", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        synthesis:
          "Cette synthèse corrigée présente les principaux axes du programme documenté et leurs moyens.",
      }),
    });
  });

  // Le bug d'origine : la synthèse d'Arthaud, écrite sur une candidature vide, niait les cinq
  // mesures publiées deux semaines plus tard. Rien sur cet écran ne le disait.
  it("nomme les candidatures dont la synthèse est démentie", () => {
    render(
      <CandidatesListClient
        rows={[row({ publicationStatus: "PUBLISHED", synthesisState: "CONTRADICTED" })]}
      />
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "1 synthèse démentie par les mesures publiées depuis"
    );
    expect(screen.getByRole("status")).toHaveTextContent("Alix Démonstration");
    expect(screen.getByText("Démentie")).toBeInTheDocument();
  });

  it("refuse la régénération sur une candidature qui n'est pas déclarée", () => {
    // La règle du service : une candidature pressentie n'a demandé à personne de lire un résumé de
    // son programme. Le bouton la porte aussi, plutôt que de laisser l'action répondre par un refus.
    render(<CandidatesListClient rows={[row({ status: "PRESSENTI" })]} />);

    expect(screen.getByRole("button", { name: "Générer une proposition" })).toBeDisabled();
  });

  it("affiche l'échec d'une régénération au lieu de le taire", async () => {
    regenerateCandidateSynthesisMock.mockResolvedValueOnce({
      ok: false,
      message: "Texte refusé par le contrôle : tiret_long.",
    });
    const user = userEvent.setup();
    render(<CandidatesListClient rows={[row()]} />);

    await user.click(screen.getByRole("button", { name: "Générer une proposition" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Texte refusé par le contrôle : tiret_long."
    );
  });
});
