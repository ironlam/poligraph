import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CiteAnchor } from "@/components/ui/CiteAnchor";
import { SITE_URL } from "@/config/site";

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: (...a: unknown[]) => toastSuccess(...a),
    error: (...a: unknown[]) => toastError(...a),
  },
}));

const writeText = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(navigator, { clipboard: { writeText } });
  window.history.replaceState({}, "", "/politiques/x?tab=affaires");
});

describe("CiteAnchor (variante anchorId)", () => {
  it("copie le permalien d'ancre et affiche le toast", async () => {
    render(<CiteAnchor anchorId="affair-1" label="cette affaire" />);
    const link = screen.getByRole("link", { name: "Copier le lien vers cette affaire" });
    expect(link).toHaveAttribute("href", "#affair-1");
    await userEvent.click(link);
    expect(writeText).toHaveBeenCalledWith(`${SITE_URL}/politiques/x?tab=affaires#affair-1`);
    expect(toastSuccess).toHaveBeenCalledWith("Lien copié");
    expect(window.location.hash).toBe("#affair-1");
  });
});

describe("CiteAnchor (variante permalink)", () => {
  it("copie le permalien d'entité", async () => {
    render(<CiteAnchor permalink={`${SITE_URL}/parlement/votes/4521`} label="ce vote" />);
    const link = screen.getByRole("link", { name: "Copier le lien vers ce vote" });
    expect(link).toHaveAttribute("href", `${SITE_URL}/parlement/votes/4521`);
    await userEvent.click(link);
    expect(writeText).toHaveBeenCalledWith(`${SITE_URL}/parlement/votes/4521`);
    expect(toastSuccess).toHaveBeenCalledWith("Lien copié");
  });
});

describe("CiteAnchor (échec clipboard)", () => {
  it("affiche un toast d'erreur", async () => {
    writeText.mockRejectedValueOnce(new Error("denied"));
    render(<CiteAnchor anchorId="affair-1" label="cette affaire" />);
    await userEvent.click(screen.getByRole("link"));
    expect(toastError).toHaveBeenCalledWith("Impossible de copier le lien");
  });
});
