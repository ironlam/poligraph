import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { HemicycleDecor, hemicycleDots } from "@/components/ui/HemicycleDecor";

describe("HemicycleDecor", () => {
  it("place 72 points dans le cadre du viewBox", () => {
    const dots = hemicycleDots();
    expect(dots).toHaveLength(72);
    for (const d of dots) {
      expect(d.cx).toBeGreaterThanOrEqual(0);
      expect(d.cx).toBeLessThanOrEqual(480);
      expect(d.cy).toBeGreaterThanOrEqual(0);
      expect(d.cy).toBeLessThanOrEqual(250);
    }
  });

  it("produit toujours la même disposition", () => {
    expect(hemicycleDots()).toEqual(hemicycleDots());
  });

  it("reste invisible pour les technologies d'assistance", () => {
    const { container } = render(<HemicycleDecor />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg?.querySelectorAll("circle")).toHaveLength(72);
  });
});
