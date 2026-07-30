import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CollapsibleCard } from "./CollapsibleCard";

describe("CollapsibleCard", () => {
  it("keeps content in the DOM but inert while collapsed", () => {
    render(
      <CollapsibleCard title="Détails">
        <a href="/x">Lien caché</a>
      </CollapsibleCard>
    );

    // Content stays rendered (SEO) even when collapsed…
    expect(screen.getByText("Lien caché")).toBeInTheDocument();

    // …but the region is inert so keyboard/AT users don't reach it.
    const header = screen.getByRole("button", { name: /détails/i });
    expect(header).toHaveAttribute("aria-expanded", "false");
    const regionId = header.getAttribute("aria-controls")!;
    const region = document.getElementById(regionId)!;
    expect(region).toHaveAttribute("inert");
  });

  it("removes inert and flips aria-expanded when opened", () => {
    render(
      <CollapsibleCard title="Détails">
        <a href="/x">Lien caché</a>
      </CollapsibleCard>
    );

    const header = screen.getByRole("button", { name: /détails/i });
    fireEvent.click(header);

    expect(header).toHaveAttribute("aria-expanded", "true");
    const region = document.getElementById(header.getAttribute("aria-controls")!)!;
    expect(region).not.toHaveAttribute("inert");
  });

  it("respects defaultOpen", () => {
    render(
      <CollapsibleCard title="Détails" defaultOpen>
        <span>Contenu</span>
      </CollapsibleCard>
    );
    const header = screen.getByRole("button", { name: /détails/i });
    expect(header).toHaveAttribute("aria-expanded", "true");
    const region = document.getElementById(header.getAttribute("aria-controls")!)!;
    expect(region).not.toHaveAttribute("inert");
  });
});
