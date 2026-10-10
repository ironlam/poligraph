import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  shareOrCopy: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/lib/share", () => ({ shareOrCopy: mocks.shareOrCopy }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));

import { PageShareButton } from "@/components/ui/PageShareButton";

describe("PageShareButton", () => {
  beforeEach(() => {
    mocks.shareOrCopy.mockReset();
    mocks.success.mockClear();
    mocks.error.mockClear();
    document.title = "Gouvernement Sébastien Lecornu II | Poligraph";
  });

  it("expose un nom accessible et un title", () => {
    render(<PageShareButton />);
    const button = screen.getByRole("button", { name: "Partager cette page" });
    expect(button).toHaveAttribute("title", "Partager cette page");
  });

  it("partage le titre et l'URL courante, filtres compris", async () => {
    mocks.shareOrCopy.mockResolvedValue("shared");
    render(<PageShareButton />);

    await userEvent.click(screen.getByRole("button", { name: "Partager cette page" }));

    expect(mocks.shareOrCopy).toHaveBeenCalledWith({
      title: "Gouvernement Sébastien Lecornu II | Poligraph",
      url: window.location.href,
    });
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.error).not.toHaveBeenCalled();
  });

  it("confirme la copie quand le partage natif est indisponible", async () => {
    mocks.shareOrCopy.mockResolvedValue("copied");
    render(<PageShareButton />);

    await userEvent.click(screen.getByRole("button", { name: "Partager cette page" }));

    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith("Lien copié"));
  });

  it("reste silencieux quand l'utilisateur annule", async () => {
    mocks.shareOrCopy.mockResolvedValue("cancelled");
    render(<PageShareButton />);

    await userEvent.click(screen.getByRole("button", { name: "Partager cette page" }));

    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.error).not.toHaveBeenCalled();
  });

  it("signale l'échec", async () => {
    mocks.shareOrCopy.mockResolvedValue("failed");
    render(<PageShareButton />);

    await userEvent.click(screen.getByRole("button", { name: "Partager cette page" }));

    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith("Impossible de partager le lien"));
  });
});
