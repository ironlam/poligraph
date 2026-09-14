import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const actions = vi.hoisted(() => ({
  createDossierAlias: vi.fn(),
  deleteDossierAlias: vi.fn(),
  publishDossierAlias: vi.fn(),
  updateDossierAliasSources: vi.fn(),
}));
vi.mock("@/app/admin/dossiers/[id]/alias-actions", () => actions);
import { DossierAliasEditor } from "../DossierAliasEditor";
const sources = [
  { url: "https://www.senat.fr/exemple", label: "Sénat" },
  { url: "https://www.assemblee-nationale.fr/exemple", label: "Assemblée nationale" },
];

beforeEach(() => {
  vi.resetAllMocks();
  actions.createDossierAlias.mockResolvedValue({ ok: true });
  actions.updateDossierAliasSources.mockResolvedValue({ ok: true });
});
describe("revue des sources des alias", () => {
  it("affiche toutes les sources avant publication et permet leur édition", async () => {
    render(
      <DossierAliasEditor
        dossierId="dossier"
        aliases={[
          {
            id: "alias",
            label: "Loi exemple",
            kind: "COMMON",
            status: "DRAFT",
            isPreferred: false,
            sources,
          },
        ]}
      />
    );
    expect(screen.getByRole("link", { name: "Sénat (source externe)" })).toHaveAttribute(
      "href",
      sources[0]!.url
    );
    expect(
      screen.getByRole("link", { name: "Assemblée nationale (source externe)" })
    ).toHaveAttribute("rel", "noopener noreferrer");
    fireEvent.click(screen.getByText("Modifier les références"));
    const submit = screen.getByRole("button", { name: "Enregistrer et remettre en brouillon" });
    fireEvent.submit(submit.closest("form")!);
    await waitFor(() =>
      expect(actions.updateDossierAliasSources).toHaveBeenCalledWith("alias", sources)
    );
  });
  it("transmet plusieurs sources à la création", async () => {
    render(<DossierAliasEditor dossierId="dossier" aliases={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Ajouter une référence" }));
    const form = screen.getByRole("button", { name: "Ajouter le nom d’usage" }).closest("form")!;
    const fields = within(form);
    fireEvent.change(fields.getByLabelText("Nom d’usage"), { target: { value: "Loi exemple" } });
    sources.forEach((source, i) => {
      fireEvent.change(fields.getByLabelText(`URL de la source ${i + 1}`), {
        target: { value: source.url },
      });
      fireEvent.change(fields.getByLabelText(`Nom de la source ${i + 1}`), {
        target: { value: source.label },
      });
    });
    fireEvent.submit(form);
    await waitFor(() =>
      expect(actions.createDossierAlias).toHaveBeenCalledWith({
        dossierId: "dossier",
        label: "Loi exemple",
        kind: "COMMON",
        sources,
      })
    );
  });
});
