import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ContextGenerationBatchPanel } from "../ContextGenerationBatchPanel";

const refresh = vi.fn();
const generate = vi.fn(async (_input: unknown) => ({
  ok: true as const,
  created: 2,
  skipped: 1,
  failed: 0,
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("../../actions", () => ({
  generateContextDraftBatchAction: (input: unknown) => generate(input),
}));

describe("ContextGenerationBatchPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("borne le lot à dix et annonce son résultat", async () => {
    render(
      <ContextGenerationBatchPanel
        measureIds={Array.from({ length: 12 }, (_, index) => `measure-${index}`)}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Générer jusqu’à 10 contextes" }));

    await waitFor(() => expect(generate).toHaveBeenCalledOnce());
    expect(generate).toHaveBeenCalledWith({
      measureIds: Array.from({ length: 10 }, (_, index) => `measure-${index}`),
    });
    expect(await screen.findByRole("status")).toHaveTextContent(
      "2 brouillons créés, 1 ignoré, 0 échecs."
    );
    expect(refresh).toHaveBeenCalled();
  });

  it("annonce un échec réseau sans laisser l'interface sans retour", async () => {
    generate.mockRejectedValueOnce(new Error("network"));
    render(<ContextGenerationBatchPanel measureIds={["measure-1"]} />);

    fireEvent.click(screen.getByRole("button", { name: "Générer 1 contexte" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "La génération du lot a échoué. Réessayez plus tard."
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it("explique pourquoi aucune génération automatique n’est proposée", () => {
    render(<ContextGenerationBatchPanel measureIds={[]} />);

    expect(
      screen.getByRole("heading", { name: "Génération assistée des contextes" })
    ).toBeVisible();
    expect(screen.getByText(/Aucune mesure de cette page/)).toBeVisible();
    expect(screen.queryByRole("button", { name: /Générer/ })).not.toBeInTheDocument();
  });
});
