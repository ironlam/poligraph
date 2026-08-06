import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PoliticianSummary } from "@/components/politicians/PoliticianSummary";
import type { Signal } from "@/lib/politicians/signals";
import type { SourceLink } from "@/lib/politicians/external-sources";
import { mountTabsAnchor } from "./helpers";

// Plain anchor: jsdom has no navigation, and the click has to reach our handler.
vi.mock("next/link", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default: ({ children, href, onClick, ...props }: any) => (
    <a
      href={href}
      onClick={(e: React.MouseEvent) => {
        e.preventDefault();
        onClick?.(e);
      }}
      {...props}
    >
      {children}
    </a>
  ),
}));

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

afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

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

  it("brings the tabs into view when a shortcut is clicked", () => {
    const anchor = mountTabsAnchor();
    render(
      <PoliticianSummary
        signals={signals}
        sources={sources}
        relationsHref="/politiques/x/relations"
        lastUpdated="19 juil. 2026"
      />
    );

    fireEvent.click(screen.getByRole("link", { name: /Mandats/ }));

    expect(anchor.scrollIntoView).toHaveBeenCalled();
  });

  it("leaves in-page anchor shortcuts to the browser", () => {
    const anchor = mountTabsAnchor();
    render(
      <PoliticianSummary
        signals={[
          {
            key: "dossiers",
            iconKey: "filetext",
            label: "Propositions de loi",
            value: "4",
            href: "/politiques/x#dossiers",
            tone: "neutral",
            primary: false,
          },
        ]}
        sources={sources}
        relationsHref="/politiques/x/relations"
        lastUpdated="19 juil. 2026"
      />
    );

    fireEvent.click(screen.getByRole("link", { name: /Propositions de loi/ }));

    expect(anchor.scrollIntoView).not.toHaveBeenCalled();
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
