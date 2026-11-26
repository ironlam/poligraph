import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { SourceVerdict } from "@/components/factchecks/SourceVerdict";

describe("SourceVerdict", () => {
  it("attribue le verdict d'origine à la rédaction", () => {
    const { container } = render(<SourceVerdict source="TF1 Info" verdict="En partie vrai" />);
    expect(container.textContent).toBe("Verdict de TF1 Info : «\u00a0En partie vrai\u00a0»");
  });

  it("garde une formulation neutre quand la rédaction est inconnue", () => {
    const { container } = render(<SourceVerdict source=" " verdict="Faux" />);
    expect(container.textContent).toBe("Verdict d'origine : «\u00a0Faux\u00a0»");
  });

  it("n'affiche rien sans verdict d'origine", () => {
    const { container } = render(<SourceVerdict source="AFP Factuel" verdict="  " />);
    expect(container).toBeEmptyDOMElement();
  });
});
