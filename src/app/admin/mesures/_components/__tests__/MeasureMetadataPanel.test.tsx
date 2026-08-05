import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MeasureMetadataPanel } from "../MeasureMetadataPanel";

const createQualificationAction = vi.fn(async (_input: unknown) => ({ ok: true }) as const);
const createSimilarityAssessmentAction = vi.fn(async (_input: unknown) => ({ ok: true }) as const);

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("../../actions", () => ({
  createQualificationAction: (input: unknown) => createQualificationAction(input),
  createSimilarityAssessmentAction: (input: unknown) => createSimilarityAssessmentAction(input),
}));

const REVISIONS = [
  {
    id: "rev-1",
    text: "Encadrer les loyers dans les zones tendues.",
    validFrom: "15 janvier 2027",
  },
  { id: "rev-2", text: "Encadrer les loyers, périmètre étendu.", validFrom: "1 février 2027" },
];

function panel(defaultRevisionId: string | null = "rev-2") {
  return render(
    <MeasureMetadataPanel
      measureId="m-1"
      revisions={REVISIONS}
      defaultRevisionId={defaultRevisionId}
    />
  );
}

describe("MeasureMetadataPanel", () => {
  it("n'ouvre aucun formulaire avant qu'on le demande", () => {
    panel();

    expect(screen.queryByLabelText("Qualificatif")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Conclusion")).not.toBeInTheDocument();
  });

  it("fait choisir explicitement la révision qualifiée", () => {
    // Une conclusion appartient au texte dont elle est tirée : deviner « la révision courante »
    // attacherait la conclusion à une autre formulation que celle lue.
    panel();
    fireEvent.click(screen.getByRole("button", { name: "Ajouter une qualification" }));

    const select = screen.getByLabelText("Révision concernée");
    expect(select).toBeRequired();
    expect((select as HTMLSelectElement).value).toBe("rev-2");
    expect(within(select as HTMLElement).getAllByRole("option")).toHaveLength(2);
  });

  it("exige une justification pour une qualification", () => {
    panel();
    fireEvent.click(screen.getByRole("button", { name: "Ajouter une qualification" }));

    expect(screen.getByLabelText("Justification")).toBeRequired();
    // Les deux champs de source vont ensemble et restent facultatifs.
    expect(screen.getByLabelText("URL de source (facultatif)")).not.toBeRequired();
  });

  it("transmet la qualification avec sa révision et sans libellé saisi", () => {
    panel("rev-1");
    fireEvent.click(screen.getByRole("button", { name: "Ajouter une qualification" }));
    fireEvent.change(screen.getByLabelText("Justification"), {
      target: { value: "Aucun chiffrage dans le programme ni dans ses sources primaires." },
    });
    fireEvent.submit(screen.getByLabelText("Justification").closest("form") as HTMLFormElement);

    expect(createQualificationAction).toHaveBeenCalledWith({
      measureId: "m-1",
      revisionId: "rev-1",
      kind: "FINANCEMENT_NON_PRECISE",
      rationale: "Aucun chiffrage dans le programme ni dans ses sources primaires.",
      sourceUrl: null,
      sourceLabel: null,
    });
  });

  it("découpe les identifiants d'équivalents sur les espaces et les virgules", () => {
    panel("rev-1");
    fireEvent.click(screen.getByRole("button", { name: "Ajouter une évaluation de similarité" }));
    fireEvent.change(screen.getByLabelText("Version du corpus comparé"), {
      target: { value: "2027-01" },
    });
    fireEvent.change(screen.getByLabelText("Justification"), {
      target: { value: "Formulation identique à deux propositions antérieures." },
    });
    fireEvent.change(screen.getByLabelText("Identifiants des révisions équivalentes"), {
      target: { value: "rev-a, rev-b  rev-c" },
    });
    fireEvent.submit(
      screen.getByLabelText("Version du corpus comparé").closest("form") as HTMLFormElement
    );

    expect(createSimilarityAssessmentAction).toHaveBeenCalledWith(
      expect.objectContaining({ equivalentRevisionIds: ["rev-a", "rev-b", "rev-c"] })
    );
  });

  it("n'envoie aucun équivalent quand le champ est vide", () => {
    // La cohérence conclusion/équivalents est validée par le lot 1 : envoyer [""] ferait échouer une
    // conclusion « aucun équivalent » pour une mauvaise raison.
    panel("rev-1");
    fireEvent.click(screen.getByRole("button", { name: "Ajouter une évaluation de similarité" }));
    fireEvent.change(screen.getByLabelText("Version du corpus comparé"), {
      target: { value: "2027-01" },
    });
    fireEvent.change(screen.getByLabelText("Justification"), {
      target: { value: "Rien de comparable dans le corpus." },
    });
    fireEvent.submit(
      screen.getByLabelText("Version du corpus comparé").closest("form") as HTMLFormElement
    );

    expect(createSimilarityAssessmentAction).toHaveBeenCalledWith(
      expect.objectContaining({ equivalentRevisionIds: [] })
    );
  });

  it("ne propose aucune modification en place", () => {
    // Plusieurs conclusions datées sur la même révision sont légitimes : une seconde lecture est une
    // seconde ligne, pas une édition de la première.
    panel();

    expect(screen.queryByRole("button", { name: /Modifier/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Supprimer/ })).not.toBeInTheDocument();
  });

  it("explique une mesure sans révision au lieu de proposer un formulaire vide", () => {
    render(<MeasureMetadataPanel measureId="m-1" revisions={[]} defaultRevisionId={null} />);

    expect(screen.getByText(/une conclusion éditoriale porte sur un texte/)).toBeInTheDocument();
  });
});
