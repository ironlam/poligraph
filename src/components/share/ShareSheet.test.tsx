import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ShareSheet } from "./ShareSheet";

const data = { title: "Titre", text: "Texte", url: "https://poligraph.fr/x" };

describe("ShareSheet export", () => {
  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", () => undefined);
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: { load: () => Promise.resolve([]) },
    });
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({})) as never;
  });

  afterEach(() => vi.unstubAllGlobals());

  it("keeps image export disabled until the card is painted", async () => {
    let finish: () => void = () => undefined;
    const draw = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    render(
      <ShareSheet
        label="Partager"
        description="d"
        data={data}
        card={{ fileName: "a.png", alt: "alt", note: "n", draw }}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Partager" }));

    await waitFor(() => expect(draw).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: /Partager l'image/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Enregistrer" })).toBeDisabled();

    await act(async () => finish());
    expect(screen.getByRole("button", { name: /Partager l'image/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Enregistrer" })).toBeEnabled();
  });
});
