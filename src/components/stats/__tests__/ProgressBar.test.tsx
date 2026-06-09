import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProgressBar } from "@/components/stats/ProgressBar";

describe("ProgressBar", () => {
  it("affiche une barre avec le bon pourcentage et les attributs ARIA", () => {
    render(<ProgressBar value={75} max={100} label="Participation" />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "75");
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
    expect(bar).toHaveAttribute("aria-label", "Participation");
  });

  it("gère max=0 sans diviser par zéro", () => {
    render(<ProgressBar value={0} max={0} label="Vide" />);
    const bar = screen.getByRole("progressbar");
    // La barre interne doit rester à 0% sans NaN
    const fill = bar.firstElementChild as HTMLElement;
    expect(fill.style.width).toBe("0%");
  });

  it("applique une couleur hexadécimale en style inline", () => {
    render(<ProgressBar value={50} max={100} hexColor="#FF0000" label="Rouge" />);
    const fill = screen.getByRole("progressbar").firstElementChild as HTMLElement;
    expect(fill.style.width).toBe("50%");
    expect(fill.style.backgroundColor).toBe("rgb(255, 0, 0)");
  });

  it("applique une classe de couleur Tailwind quand fournie", () => {
    render(<ProgressBar value={30} max={100} color="bg-primary" label="Primary" />);
    const fill = screen.getByRole("progressbar").firstElementChild as HTMLElement;
    expect(fill.className).toContain("bg-primary");
  });
});
