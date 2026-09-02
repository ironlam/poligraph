import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AvailableAction } from "../../_data/available-actions";
import { MeasureActionPanel } from "../MeasureActionPanel";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("../../actions", () => ({
  reviewRevisionAction: vi.fn(async () => ({ ok: true })),
  rejectRevisionAction: vi.fn(async () => ({ ok: true })),
  publishRevisionAction: vi.fn(async () => ({ ok: true })),
  draftRevisionAction: vi.fn(async () => ({ ok: true })),
  depublishMeasureAction: vi.fn(async () => ({ ok: true })),
  withdrawMeasureAction: vi.fn(async () => ({ ok: true })),
  generateContextDraftAction: vi.fn(async () => ({ ok: true })),
}));

const BASE = {
  measureId: "m-1",
  expectedUpdatedAt: "2027-01-16T10:00:00.000Z",
  revisionTexts: { "rev-1": "Encadrer les loyers dans les zones tendues." },
  revisionDetails: { "rev-1": null as string | null },
  canGenerateContext: false,
  isWithdrawn: false,
  pointersAmbiguous: false,
};

function panel(actions: AvailableAction[], over: Partial<typeof BASE> = {}) {
  return render(<MeasureActionPanel {...BASE} {...over} actions={actions} />);
}

describe("MeasureActionPanel", () => {
  it("distingue une première publication d'une correction", () => {
    // Publier pour la première fois et publier une correction n'ont pas le même effet public, donc
    // pas le même libellé.
    const first = panel([{ kind: "publish", revisionId: "rev-1", isFirstPublication: true }]);
    expect(screen.getByRole("button", { name: "Publier cette version" })).toBeInTheDocument();
    first.unmount();

    panel([{ kind: "publish", revisionId: "rev-1", isFirstPublication: false }]);
    expect(screen.getByRole("button", { name: "Publier cette correction" })).toBeInTheDocument();
  });

  it("n'ouvre aucun formulaire tant qu'on n'a rien demandé", () => {
    // Sept formulaires ouverts sur un téléphone est illisible et invite à agir sur le mauvais.
    panel([{ kind: "draft" }, { kind: "depublish" }, { kind: "withdraw" }]);

    expect(screen.queryByLabelText("Motif de la dépublication")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Texte de la nouvelle révision")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Date du retrait")).not.toBeInTheDocument();
  });

  it("exige un motif avant de dépublier", () => {
    panel([{ kind: "depublish" }]);

    fireEvent.click(screen.getByRole("button", { name: "Dépublier" }));

    const reason = screen.getByLabelText("Motif de la dépublication");
    expect(reason).toBeRequired();
  });

  it("nomme la révision et exige un motif structuré avant un rejet", () => {
    // Une action dangereuse doit dire sur quel texte elle agit.
    panel([{ kind: "reject", revisionId: "rev-1" }]);

    fireEvent.click(screen.getByRole("button", { name: "Rejeter la proposition" }));

    expect(screen.getByText(/Encadrer les loyers dans les zones tendues/)).toBeInTheDocument();
    expect(screen.getByLabelText("Motif")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Confirmer le rejet/ })).toBeInTheDocument();
  });

  it("ne présente pas un retrait comme une dépublication", () => {
    panel([{ kind: "withdraw" }]);

    fireEvent.click(screen.getByRole("button", { name: "Enregistrer un retrait du candidat" }));

    // Le retrait est l'acte du candidat, la dépublication est le nôtre : l'écran doit le dire, et
    // les trois champs de source sont exigés.
    expect(screen.getByText(/l'acte du/)).toBeInTheDocument();
    expect(screen.getByLabelText("Date du retrait")).toBeRequired();
    expect(screen.getByLabelText("URL de la source")).toBeRequired();
    expect(screen.getByLabelText("Libellé de la source")).toBeRequired();
  });

  it("rappelle qu'une correction ne réactive pas une mesure retirée", () => {
    panel([{ kind: "draft" }], { isWithdrawn: true });

    expect(screen.getByText(/ne réactive pas la proposition/)).toBeInTheDocument();
  });

  it("exige une source dans le formulaire de nouvelle révision", () => {
    panel([{ kind: "draft" }]);

    fireEvent.click(screen.getByRole("button", { name: "Saisir une nouvelle révision" }));

    const form = screen.getByLabelText("Texte de la nouvelle révision").closest("form");
    expect(form).not.toBeNull();
    expect(within(form as HTMLElement).getByLabelText("URL")).toBeRequired();
    expect(within(form as HTMLElement).getByLabelText("Date de la source")).toBeRequired();
  });

  it("préremplit une correction et conserve sa preuve sans redemander la source", () => {
    panel([{ kind: "draft", preservesEvidenceFromRevisionId: "rev-1" }], {
      revisionDetails: { "rev-1": "Contexte documenté." },
    });

    fireEvent.click(screen.getByRole("button", { name: "Corriger la proposition" }));

    expect(screen.getByLabelText("Texte de la nouvelle révision")).toHaveValue(
      BASE.revisionTexts["rev-1"]
    );
    expect(screen.getByLabelText("Détails documentés (facultatif)")).toHaveValue(
      "Contexte documenté."
    );
    expect(screen.queryByLabelText("URL")).not.toBeInTheDocument();
  });

  it("refuse toute action quand les pointeurs sont ambigus, et dit pourquoi", () => {
    panel([{ kind: "depublish" }], { pointersAmbiguous: true });

    expect(screen.getByText("Aucune action proposée sur cette mesure.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Dépublier" })).not.toBeInTheDocument();
  });

  it("explique un état sans action au lieu de rendre un bloc vide", () => {
    panel([]);

    expect(
      screen.getByText("Aucune action éditoriale disponible dans cet état.")
    ).toBeInTheDocument();
  });

  it("propose un brouillon sourcé sans le présenter comme une publication", () => {
    panel([], { canGenerateContext: true });

    expect(
      screen.getByRole("button", { name: "Générer un brouillon de contexte" })
    ).toBeInTheDocument();
    expect(screen.getByText(/brouillon invisible du public/)).toBeInTheDocument();
  });
});
