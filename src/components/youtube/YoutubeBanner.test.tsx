import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { YoutubeBanner } from "./YoutubeBanner";
import { YOUTUBE_CHANNEL_URL } from "@/config/youtube";

const DISMISS_KEY = "youtube-banner-dismissed";

describe("YoutubeBanner", () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("propose un lien vers la chaîne dans un nouvel onglet", () => {
    render(<YoutubeBanner />);
    const link = screen.getByRole("link", { name: /s'abonner à la chaîne/i });
    expect(link).toHaveAttribute("href", YOUTUBE_CHANNEL_URL);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("dit ce qui aide la chaîne : abonnement, like, commentaire", () => {
    render(<YoutubeBanner />);
    const text = screen.getByRole("complementary").textContent ?? "";
    expect(text).toMatch(/abonnement/i);
    expect(text).toMatch(/like/i);
    expect(text).toMatch(/commentaire/i);
  });

  it("affiche le logo YouTube, caché aux lecteurs d'écran", () => {
    render(<YoutubeBanner />);
    const logo = screen.getByTestId("youtube-logo");
    expect(logo).toHaveAttribute("aria-hidden", "true");
  });

  it("se ferme au clic et retient la fermeture", () => {
    render(<YoutubeBanner />);
    fireEvent.click(screen.getByRole("button", { name: "Fermer le bandeau" }));
    expect(screen.queryByRole("link", { name: /s'abonner/i })).toBeNull();
    expect(localStorage.getItem(DISMISS_KEY)).toBe("1");
  });

  it("reste fermé quand la fermeture est déjà retenue", () => {
    localStorage.setItem(DISMISS_KEY, "1");
    render(<YoutubeBanner />);
    expect(screen.queryByRole("link", { name: /s'abonner/i })).toBeNull();
  });

  it("s'affiche et se ferme quand le stockage lève une exception", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    render(<YoutubeBanner />);
    expect(screen.getByRole("link", { name: /s'abonner/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Fermer le bandeau" }));
    expect(screen.queryByRole("link", { name: /s'abonner/i })).toBeNull();
  });
});
