import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MotionsDeCensureCallout } from "@/components/votes/MotionsDeCensureCallout";

describe("MotionsDeCensureCallout", () => {
  it("est un seul lien vers la page des motions, avec sa description", () => {
    render(<MotionsDeCensureCallout />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/parlement/motions-de-censure");
    expect(link).toHaveTextContent("Toutes les motions de censure votées à l'Assemblée");
    expect(link).toHaveTextContent(
      "Voix pour, majorité requise, gouvernement visé et résultat, sur une seule page."
    );
  });

  it("garde la cible tactile de 44 px", () => {
    render(<MotionsDeCensureCallout className="mb-8" />);
    expect(screen.getByRole("link")).toHaveClass("min-h-11", "mb-8");
  });
});
