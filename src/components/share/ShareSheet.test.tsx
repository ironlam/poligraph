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

  it("offers the story format, the publication one being the default", async () => {
    render(
      <ShareSheet
        label="Partager"
        description="d"
        data={data}
        card={{ fileName: "a.png", alt: "alt", note: "n", draw: () => undefined }}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Partager" }));

    const post = screen.getByRole("button", { name: "Publication (4:5)" });
    const story = screen.getByRole("button", { name: "Story (9:16)" });
    expect(post).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(story);
    expect(story).toHaveAttribute("aria-pressed", "true");
    expect(post).toHaveAttribute("aria-pressed", "false");
  });

  it("has no format to choose when there is no image", () => {
    render(<ShareSheet label="Partager" description="d" data={data} card={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Partager" }));
    expect(screen.queryByRole("group", { name: "Format de l'image" })).toBeNull();
  });
});
