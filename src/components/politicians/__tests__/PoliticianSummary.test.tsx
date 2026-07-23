import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PoliticianSummary } from "@/components/politicians/PoliticianSummary";
import type { Signal } from "@/lib/politicians/signals";
import type { SourceLink } from "@/lib/politicians/external-sources";

const signals: Signal[] = [
  {
    key: "mandats",
    iconKey: "mandate",
    label: "Mandats",
    value: "8",
    href: "/politiques/x?tab=carriere",
    tone: "neutral",
    primary: true,
  },
];
const sources: SourceLink[] = [{ source: "HATVP", label: "HATVP", url: "https://www.hatvp.fr/x" }];

describe("PoliticianSummary", () => {
  it("renders every signal as a link and the sources with a new-tab hint", () => {
    render(
      <PoliticianSummary
        signals={signals}
        sources={sources}
        relationsHref="/politiques/x/relations"
        lastUpdated="19 juil. 2026"
      />
    );
    expect(screen.getByRole("link", { name: /Mandats/ })).toBeInTheDocument();
    const hatvp = screen.getByRole("link", { name: /HATVP.*ouvre un nouvel onglet/i });
    expect(hatvp).toHaveAttribute("target", "_blank");
    expect(hatvp).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("generates no fixed HTML id (mounted twice)", () => {
    const { container } = render(
      <PoliticianSummary
        signals={signals}
        sources={sources}
        relationsHref="/politiques/x/relations"
        lastUpdated="19 juil. 2026"
      />
    );
    expect(container.querySelectorAll("[id]").length).toBe(0);
  });
});
