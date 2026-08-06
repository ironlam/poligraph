import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VoteLinkForm } from "../VoteLinkForm";

const attachVoteLinkAction = vi.fn(async (_input: unknown) => ({ ok: true }) as const);

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("../../actions", () => ({
  attachVoteLinkAction: (input: unknown) => attachVoteLinkAction(input),
}));

const REVISIONS = [
  {
    id: "rev-1",
    text: "Encadrer les loyers dans les zones tendues.",
    validFrom: "15 janvier 2027",
  },
];

function open() {
  render(<VoteLinkForm measureId="m-1" revisions={REVISIONS} defaultRevisionId="rev-1" />);
  fireEvent.click(screen.getByRole("button", { name: "Rattacher un scrutin" }));
}

function fillCommonFields() {
  fireEvent.change(screen.getByLabelText("Date de vérification"), {
    target: { value: "2026-05-20" },
  });
  fireEvent.click(screen.getByRole("checkbox", { name: "Assemblée nationale" }));
  fireEvent.change(screen.getByLabelText("Méthode de recherche"), {
    target: { value: "Filtre par thème sur les scrutins de la 17e législature" },
  });
  fireEvent.change(screen.getByLabelText("Justification / constat"), {
    target: { value: "Vérifié sur les scrutins d'amendement du texte." },
  });
}

function submit() {
  fireEvent.submit(
    screen.getByLabelText("Méthode de recherche").closest("form") as HTMLFormElement
  );
}

beforeEach(() => {
  attachVoteLinkAction.mockClear();
});

describe("VoteLinkForm", () => {
  it("ne montre le formulaire qu'après la demande", () => {
    render(<VoteLinkForm measureId="m-1" revisions={REVISIONS} defaultRevisionId="rev-1" />);
    expect(screen.queryByLabelText("Méthode de recherche")).not.toBeInTheDocument();
  });

  it("explique une mesure sans révision au lieu d'un formulaire vide", () => {
    render(<VoteLinkForm measureId="m-1" revisions={[]} defaultRevisionId={null} />);
    expect(screen.getByText(/un lien à un scrutin porte sur une formulation/)).toBeInTheDocument();
  });

  // The whole point of the screen: "no scrutin found" and "absent from the scrutin" are different
  // controls in different groups. You can never file one as the other.
  it("sépare « aucun scrutin trouvé » et « absent au scrutin » en deux contrôles distincts", () => {
    open();
    // Same-object is the default, so both the situation option and the relation option exist and differ.
    const noVote = screen.getByRole("radio", {
      name: "Aucun scrutin pertinent trouvé dans le périmètre",
    });
    const absence = screen.getByRole("radio", { name: "Absent(e) au scrutin" });
    expect(noVote).toBeInTheDocument();
    expect(absence).toBeInTheDocument();
    expect(noVote).not.toBe(absence);
    expect((noVote as HTMLInputElement).name).toBe("situation");
    expect((absence as HTMLInputElement).name).toBe("relation");
  });

  it("cache le scrutin et la relation quand aucun scrutin n'est identifié", () => {
    open();
    fireEvent.click(
      screen.getByRole("radio", { name: "Aucun scrutin pertinent trouvé dans le périmètre" })
    );
    expect(screen.queryByLabelText("Identifiant du scrutin")).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "Absent(e) au scrutin" })).not.toBeInTheDocument();
    expect(screen.getByText(/Ce n'est pas une absence au scrutin/)).toBeInTheDocument();
  });

  it("montre le scrutin mais pas de relation pour un texte plus large", () => {
    open();
    fireEvent.click(
      screen.getByRole("radio", { name: "Scrutin sur un texte plus large contenant la mesure" })
    );
    expect(screen.getByLabelText("Identifiant du scrutin")).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "Favorable à la mesure" })).not.toBeInTheDocument();
  });

  it("transmet un « aucun vote identifié » sans scrutin ni relation", () => {
    open();
    fireEvent.click(
      screen.getByRole("radio", { name: "Aucun scrutin pertinent trouvé dans le périmètre" })
    );
    fillCommonFields();
    submit();

    expect(attachVoteLinkAction).toHaveBeenCalledWith(
      expect.objectContaining({
        measureId: "m-1",
        applicableRevisionId: "rev-1",
        situation: { kind: "NO_VOTE_IDENTIFIED" },
        institutionScope: ["AN"],
      })
    );
  });

  it("transmet une absence comme une relation sur un scrutin identifié", () => {
    open();
    fireEvent.change(screen.getByLabelText("Identifiant du scrutin"), {
      target: { value: "scrutin-42" },
    });
    fireEvent.click(screen.getByRole("radio", { name: "Absent(e) au scrutin" }));
    fillCommonFields();
    submit();

    expect(attachVoteLinkAction).toHaveBeenCalledWith(
      expect.objectContaining({
        situation: {
          kind: "SAME_OBJECT",
          scrutinId: "scrutin-42",
          relation: "ABSENCE",
          isReference: false,
        },
      })
    );
  });

  it("refuse un scrutin sur le même objet sans identifiant de scrutin", () => {
    open();
    fireEvent.click(screen.getByRole("radio", { name: "Favorable à la mesure" }));
    fillCommonFields();
    submit();

    expect(attachVoteLinkAction).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/identifiant du scrutin/i);
  });

  it("exige au moins une chambre examinée", () => {
    open();
    fireEvent.change(screen.getByLabelText("Identifiant du scrutin"), {
      target: { value: "scrutin-42" },
    });
    fireEvent.click(screen.getByRole("radio", { name: "Favorable à la mesure" }));
    fireEvent.change(screen.getByLabelText("Date de vérification"), {
      target: { value: "2026-05-20" },
    });
    fireEvent.change(screen.getByLabelText("Méthode de recherche"), {
      target: { value: "Filtre par thème" },
    });
    fireEvent.change(screen.getByLabelText("Justification / constat"), {
      target: { value: "Constat." },
    });
    submit();

    expect(attachVoteLinkAction).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/au moins une chambre/i);
  });
});
