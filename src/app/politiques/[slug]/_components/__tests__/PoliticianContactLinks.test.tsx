import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PoliticianContactLinks } from "../PoliticianContactLinks";

const EMPTY = {
  fullName: "Marie Dupont",
  contactEmail: null,
  contactTwitter: null,
  contactFacebook: null,
  contactWebsite: null,
};

describe("PoliticianContactLinks", () => {
  it("renders nothing when there is no contact at all", () => {
    const { container } = render(<PoliticianContactLinks {...EMPTY} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("builds a mailto link that does not open a new tab", () => {
    render(<PoliticianContactLinks {...EMPTY} contactEmail="marie@example.test" />);

    const link = screen.getByRole("link", { name: "Envoyer un email à Marie Dupont" });
    expect(link).toHaveAttribute("href", "mailto:marie@example.test");
    expect(link).not.toHaveAttribute("target");
  });

  it("turns a bare X handle into a profile URL and strips the @", () => {
    render(<PoliticianContactLinks {...EMPTY} contactTwitter="@mariedupont" />);

    expect(screen.getByRole("link", { name: "Profil X de Marie Dupont" })).toHaveAttribute(
      "href",
      "https://x.com/mariedupont"
    );
  });

  it("leaves a full URL alone", () => {
    render(<PoliticianContactLinks {...EMPTY} contactTwitter="https://x.com/mariedupont" />);

    expect(screen.getByRole("link", { name: "Profil X de Marie Dupont" })).toHaveAttribute(
      "href",
      "https://x.com/mariedupont"
    );
  });

  it("prefixes a bare domain with https", () => {
    render(<PoliticianContactLinks {...EMPTY} contactWebsite="marie-dupont.fr" />);

    expect(screen.getByRole("link", { name: "Site web de Marie Dupont" })).toHaveAttribute(
      "href",
      "https://marie-dupont.fr"
    );
  });

  it("opens external links safely", () => {
    render(<PoliticianContactLinks {...EMPTY} contactFacebook="marie.dupont" />);

    const link = screen.getByRole("link", { name: "Page Facebook de Marie Dupont" });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("keeps a stable order regardless of which contacts exist", () => {
    render(
      <PoliticianContactLinks
        fullName="Marie Dupont"
        contactEmail="marie@example.test"
        contactTwitter="mariedupont"
        contactFacebook="marie.dupont"
        contactWebsite="marie-dupont.fr"
      />
    );

    expect(screen.getAllByRole("link").map((a) => a.getAttribute("title"))).toEqual([
      "Email",
      "X (Twitter)",
      "Facebook",
      "Site web",
    ]);
  });

  it("names every link for a screen reader", () => {
    // The anchors hold an icon and no text, so the accessible name has to come from aria-label.
    render(<PoliticianContactLinks {...EMPTY} contactEmail="marie@example.test" />);

    for (const link of screen.getAllByRole("link")) {
      expect(link.getAttribute("aria-label")).toBeTruthy();
    }
  });
});
