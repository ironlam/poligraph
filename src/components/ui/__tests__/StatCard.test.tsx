import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatCard } from "@/components/ui/StatCard";

const accent = { border: "#D97706", bg: "#D977060a" };

describe("StatCard", () => {
  it("affiche le compteur et le label", () => {
    render(<StatCard count={42} label="Affaires" accent={accent} />);
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("Affaires")).toBeInTheDocument();
  });

  it("formate le compteur en français (séparateur de milliers)", () => {
    render(<StatCard count={1234} label="Votes" accent={accent} />);
    // toLocaleString("fr-FR") utilise une espace fine insécable
    expect(screen.getByText(/1\s*234/)).toBeInTheDocument();
  });

  it("rend un lien quand href est fourni", () => {
    render(<StatCard count={10} label="Test" accent={accent} href="/test" />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/test");
  });

  it("ne rend pas de lien sans href", () => {
    render(<StatCard count={10} label="Test" accent={accent} />);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("affiche la description optionnelle", () => {
    render(<StatCard count={5} label="Test" description="Détail" accent={accent} />);
    expect(screen.getByText("Détail")).toBeInTheDocument();
  });
});
