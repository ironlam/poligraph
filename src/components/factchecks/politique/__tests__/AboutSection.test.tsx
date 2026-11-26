import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: {} }));

import { ABOUT_PREVIEW_COUNT, AboutSection } from "../PoliticianFactChecks";
import type { PoliticianFactCheckLanding } from "@/lib/data/factcheck-politician";

const item = (n: number, verdictRating: "FALSE" | "TRUE" = "FALSE") => ({
  slug: `fc-${n}`,
  title: `Rumeur ${n}`,
  claimText: `Affirmation ${n}`,
  verdictRating,
  source: "AFP Factuel",
  publishedAt: new Date(Date.UTC(2026, 10, 25 - n)),
});

function landing(about: number, pending = 0): PoliticianFactCheckLanding {
  const rows = Array.from({ length: about }, (_, i) => item(i + 1, i === 0 ? "TRUE" : "FALSE"));
  return {
    author: { slug: "jean-luc-melenchon", fullName: "Jean-Luc Mélenchon" },
    hasCandidacy: false,
    claimed: [],
    about: rows,
    aboutBreakdown: {
      vrai: rows.length ? 1 : 0,
      trompeur: 0,
      faux: Math.max(rows.length - 1, 0),
      inverifiable: 0,
    },
    aboutPending: Array.from({ length: pending }, (_, i) => item(i + 50)),
    breakdown: { vrai: 0, trompeur: 0, faux: 0, inverifiable: 0 },
    bySource: [],
    firstYear: null,
    indexable: false,
  } as unknown as PoliticianFactCheckLanding;
}

describe("AboutSection", () => {
  it("est absente quand rien ne porte sur la personne", () => {
    const { container } = render(<AboutSection landing={landing(0)} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("dit que la personne n'est pas l'auteur et liste tout sous le seuil de repli", () => {
    render(<AboutSection landing={landing(3)} />);
    const section = screen.getByRole("region", { name: /^Vérifications à son sujet/ });
    expect(section).toHaveAttribute("id", "a-son-sujet");
    expect(within(section).getByText(/au sujet de Jean-Luc Mélenchon/)).toBeInTheDocument();
    expect(
      within(section).getByRole("heading", { name: "Vérifications à son sujet (3)" })
    ).toBeTruthy();
    // Titre seul : la citation doublerait chaque ligne sur téléphone.
    expect(within(section).queryByText(/Affirmation 1/)).toBeNull();
    expect(within(section).getAllByRole("link", { name: /Rumeur \d/ })).toHaveLength(3);
    expect(section.querySelector("details")).toBeNull();
  });

  it("replie au-delà de cinq vérifications, filtre par verdict dans le repli", () => {
    render(<AboutSection landing={landing(8)} />);
    const section = screen.getByRole("region", { name: /^Vérifications à son sujet/ });
    const details = section.querySelector<HTMLElement>("details[data-about-all]")!;
    expect(details).not.toBeNull();
    expect(
      within(details).getByText("Voir les 8 vérifications et filtrer par verdict")
    ).toBeTruthy();
    const preview = section.querySelector(":scope > ul")!;
    expect(within(preview as HTMLElement).getAllByRole("link")).toHaveLength(ABOUT_PREVIEW_COUNT);
    expect(within(details).getByRole("group", { name: "Filtrer par verdict" })).toBeTruthy();
    // Only the full-list disclosure hides the preview: the pending one must not.
    expect(preview.className).toContain("group-has-[[data-about-all][open]]/about:hidden");
  });

  it("garde à part, sans les compter, les mentions sur le nom seul en attente", () => {
    render(<AboutSection landing={landing(0, 2)} />);
    expect(screen.getByText("Rattachement à confirmer (2 fact-checks)")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Vérifications à son sujet" })).toBeTruthy();
  });
});
