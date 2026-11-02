import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ParliamentThemeBridge } from "../ParliamentThemeBridge";

const snapshot = {
  dossierCount: 1234,
  scrutinCount: 56,
  latestDossiers: [
    {
      slug: "loi-sante",
      title: "Projet de loi santé",
      shortTitle: null,
      status: "EN_COURS" as const,
      filingDate: new Date("2026-03-04T12:00:00Z"),
    },
  ],
};

describe("ParliamentThemeBridge", () => {
  it("propose les dossiers, les scrutins et rappelle que le lien est thématique", () => {
    render(
      <ParliamentThemeBridge
        source="theme"
        target={{ theme: "SANTE", scope: "same" }}
        snapshot={snapshot}
        dossiersEnabled
      />
    );

    expect(screen.getByRole("heading", { name: /Au Parlement/ })).toBeInTheDocument();
    expect(screen.getByText(/aucun rapprochement/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Projet de loi santé/ })).toHaveAttribute(
      "href",
      "/parlement/dossiers/loi-sante"
    );
    const dossiers = screen.getByRole("link", { name: /1\s?234 dossiers législatifs/ });
    expect(dossiers).toHaveAttribute("href", "/parlement/dossiers?theme=SANTE");
    expect(dossiers).toHaveAttribute("data-umami-event", "pres_bridge_click");
    expect(dossiers).toHaveAttribute("data-umami-event-source", "theme");
    expect(screen.getByRole("link", { name: /56 scrutins/ })).toHaveAttribute(
      "href",
      "/parlement/votes/themes/sante"
    );
  });

  it("annonce une catégorie plus large quand le thème est replié", () => {
    render(
      <ParliamentThemeBridge
        source="mesure"
        target={{ theme: "SOCIAL_TRAVAIL", scope: "broader" }}
        snapshot={snapshot}
        dossiersEnabled
      />
    );
    expect(screen.getByText(/plus large que le sujet de cette page/)).toBeInTheDocument();
  });

  it("ne pointe pas vers les dossiers quand la rubrique est désactivée", () => {
    render(
      <ParliamentThemeBridge
        source="theme"
        target={{ theme: "SANTE", scope: "same" }}
        snapshot={snapshot}
        dossiersEnabled={false}
      />
    );
    expect(screen.queryByRole("link", { name: /dossiers/ })).toBeNull();
    expect(screen.getByRole("link", { name: /scrutins/ })).toBeInTheDocument();
  });

  it("ne rend rien sans donnée à montrer", () => {
    const { container } = render(
      <ParliamentThemeBridge
        source="theme"
        target={{ theme: "SANTE", scope: "same" }}
        snapshot={{ dossierCount: 0, scrutinCount: 0, latestDossiers: [] }}
        dossiersEnabled
      />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
