import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PresumptionNotice } from "@/components/politicians/PresumptionNotice";

describe("PresumptionNotice", () => {
  it("renders nothing when not applicable", () => {
    const { container } = render(
      <PresumptionNotice proceduresEnCours={0} condamnationsNonDefinitives={0} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the localized note when applicable", () => {
    render(<PresumptionNotice proceduresEnCours={2} condamnationsNonDefinitives={0} />);
    expect(screen.getByText(/Présomption d'innocence\./)).toBeInTheDocument();
    expect(screen.getByText(/2 procédures en cours/)).toBeInTheDocument();
  });
});
