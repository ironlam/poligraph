import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProfileReturnLink } from "../ProfileReturnLink";
import { RETURN_STORAGE_KEY } from "../return-entry";

const NOW = Date.parse("2026-10-10T12:00:00Z");

function store(entry: Record<string, unknown>) {
  window.sessionStorage.setItem(RETURN_STORAGE_KEY, JSON.stringify(entry));
}

function entry(overrides: Record<string, unknown> = {}) {
  return {
    targetSlug: "karim-delaunay",
    returnUrl: "/politiques/gouvernements/membres?du=2017-05-15",
    label: "Retour à « Membres des gouvernements »",
    scrollY: 420,
    createdAt: NOW - 60_000,
    ...overrides,
  };
}

// The link appears after mount (storage is read in an effect): wait for effects, then assert.
async function settle() {
  await waitFor(() => expect(document.body).toBeTruthy());
  await new Promise((r) => setTimeout(r, 0));
}

describe("ProfileReturnLink", () => {
  beforeEach(() => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    window.sessionStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    window.sessionStorage.clear();
  });

  it("affiche le lien de retour pour une entrée valide", async () => {
    store(entry());
    render(<ProfileReturnLink slug="karim-delaunay" />);
    const link = await screen.findByRole("link", { name: /Membres des gouvernements/ });
    expect(link).toHaveAttribute("href", "/politiques/gouvernements/membres?du=2017-05-15");
    expect(link.textContent).toContain("Retour à « Membres des gouvernements »");
  });

  it("n'affiche rien pour l'entrée d'un autre profil", async () => {
    store(entry({ targetSlug: "autre-personne" }));
    render(<ProfileReturnLink slug="karim-delaunay" />);
    await settle();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("n'affiche rien pour une entrée de plus de 30 minutes", async () => {
    store(entry({ createdAt: NOW - 31 * 60_000 }));
    render(<ProfileReturnLink slug="karim-delaunay" />);
    await settle();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it.each([
    "https://example.com/politiques/gouvernements",
    "//example.com/politiques/gouvernements",
    "/politiques/karim-delaunay",
    "/politiques/gouvernementsx",
    "/\\example.com",
  ])("n'affiche rien pour une URL de retour hors rubrique : %s", async (returnUrl) => {
    store(entry({ returnUrl }));
    render(<ProfileReturnLink slug="karim-delaunay" />);
    await settle();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("n'affiche rien et ne lève pas quand sessionStorage lève une exception", async () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(() => render(<ProfileReturnLink slug="karim-delaunay" />)).not.toThrow();
    await settle();
    expect(screen.queryByRole("link")).toBeNull();
    expect(spy).toHaveBeenCalled();
  });

  it("n'affiche rien pour une entrée illisible", async () => {
    window.sessionStorage.setItem(RETURN_STORAGE_KEY, "{pas du json");
    render(<ProfileReturnLink slug="karim-delaunay" />);
    await settle();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
