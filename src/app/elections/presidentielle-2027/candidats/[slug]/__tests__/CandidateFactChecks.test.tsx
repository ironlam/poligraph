import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetFactCheckLanding = vi.fn();
vi.mock("@/lib/data/factcheck-politician", () => ({
  getPoliticianFactCheckLanding: (slug: string) => mockGetFactCheckLanding(slug),
  factCheckPoliticianPath: (slug: string) => `/factchecks/politique/${slug}`,
  FACTCHECK_ABOUT_ANCHOR: "a-son-sujet",
  // Read by the shared verdict bar.
  VERDICT_GROUP_KEYS: ["vrai", "trompeur", "faux", "inverifiable"],
  groupByYear: vi.fn(),
  verdictGroupOf: vi.fn(),
}));

const factCheck = (n: number) => ({
  slug: `fc-${n}`,
  title: `Vérification ${n}`,
  claimText: `Déclaration ${n}`,
  verdictRating: "FALSE",
  source: n % 2 ? "AFP Factuel" : "Les Décodeurs",
  publishedAt: new Date(Date.UTC(2026, 10, 20 - n)),
});

const landing = (claimedCount: number, indexable: boolean, aboutCount = 0) => {
  const claimed = Array.from({ length: claimedCount }, (_, i) => factCheck(i + 1));
  return {
    author: { id: "p1", slug: "camille-riviere", fullName: "Camille Rivière" },
    hasCandidacy: true,
    claimed,
    about: Array.from({ length: aboutCount }, (_, i) => factCheck(i + 99)),
    aboutPending: [factCheck(98)],
    breakdown: { vrai: 0, trompeur: 0, faux: claimedCount, inverifiable: 0 },
    bySource: [...new Set(claimed.map((c) => c.source))].map((name) => ({ name })),
    firstYear: claimedCount ? 2026 : null,
    indexable,
  };
};

import { CandidateFactChecksSection } from "../_components/CandidateFactChecks";

async function renderSection() {
  const element = await CandidateFactChecksSection({ slug: "camille-riviere" });
  return render(<>{element}</>);
}

describe("CandidateFactChecksSection", () => {
  beforeEach(() => vi.clearAllMocks());

  it("ne rend rien sans déclaration vérifiée, même si la personne est citée ailleurs", async () => {
    mockGetFactCheckLanding.mockResolvedValue(landing(0, false));
    const { container } = await renderSection();
    expect(container).toBeEmptyDOMElement();
    expect(mockGetFactCheckLanding).toHaveBeenCalledWith("camille-riviere");
  });

  it("ne rend rien sans landing", async () => {
    mockGetFactCheckLanding.mockResolvedValue(null);
    const { container } = await renderSection();
    expect(container).toBeEmptyDOMElement();
  });

  it("s'affiche dès une vérification et renvoie à la liste filtrée tant que la landing n'est pas indexable", async () => {
    mockGetFactCheckLanding.mockResolvedValue(landing(1, false));
    await renderSection();
    expect(screen.getByRole("heading", { name: "Ses déclarations vérifiées" })).toBeInTheDocument();
    expect(
      screen.getByText(/1 déclaration vérifiée par 1 rédaction de fact-checking\./)
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Vérification 1/ })).toHaveAttribute(
      "href",
      "/factchecks/fc-1"
    );
    expect(
      screen.getByRole("link", { name: "Voir le détail par verdict et par rédaction" })
    ).toHaveAttribute("href", "/factchecks?politician=camille-riviere");
    // Les vérifications qui citent seulement la personne restent hors de la fiche.
    expect(screen.queryByText("Vérification 99")).not.toBeInTheDocument();
  });

  it("montre les 3 plus récentes et renvoie à la landing quand elle est indexable", async () => {
    mockGetFactCheckLanding.mockResolvedValue(landing(5, true));
    await renderSection();
    expect(screen.getByText(/5 déclarations vérifiées par 2 rédactions/)).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Vérification \d/ })).toHaveLength(3);
    expect(screen.queryByText("Vérification 4")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Voir ses 5 déclarations vérifiées" })).toHaveAttribute(
      "href",
      "/factchecks/politique/camille-riviere"
    );
  });

  it("renvoie aux vérifications à son sujet par un lien compté, sans les lister", async () => {
    mockGetFactCheckLanding.mockResolvedValue(landing(3, true, 2));
    await renderSection();
    expect(screen.getByRole("link", { name: "Vérifications à son sujet (2)" })).toHaveAttribute(
      "href",
      "/factchecks/politique/camille-riviere#a-son-sujet"
    );
    expect(screen.queryByText("Vérification 99")).not.toBeInTheDocument();
    expect(screen.queryByText("Vérification 98")).not.toBeInTheDocument();
  });

  it("n'affiche pas ce lien sans vérification confirmée à son sujet", async () => {
    mockGetFactCheckLanding.mockResolvedValue(landing(3, true));
    await renderSection();
    expect(screen.queryByRole("link", { name: /à son sujet/ })).not.toBeInTheDocument();
  });
});
