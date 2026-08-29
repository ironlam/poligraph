import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HubCandidacy } from "@/lib/data/hub";
import { CandidacyCard, CandidacyFieldBrowser } from "../CandidacyFieldBrowser";

const navigation = vi.hoisted(() => ({
  replace: vi.fn(),
  searchParams: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: navigation.replace,
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
  useSearchParams: () => navigation.searchParams,
  usePathname: () => "/elections/presidentielle-2027",
}));

function candidacy(over: Partial<HubCandidacy> = {}): HubCandidacy {
  return {
    id: "c1",
    candidateName: "Alix Dupont",
    politicianSlug: "alix-dupont",
    photoUrl: null,
    blobPhotoUrl: null,
    status: "PRESSENTI",
    sourceUrl: "https://example.org/source",
    sourceLabel: "Le Monde",
    partyLabel: "Parti Test",
    partyColor: "#ff0000",
    partyShortName: "PT",
    partyLogoUrl: null,
    measureCount: 0,
    themesCoveredCount: 0,
    programmeAbsence: "aucun_programme",
    ...over,
  };
}

describe("annuaire présidentiel", () => {
  beforeEach(() => {
    navigation.replace.mockReset();
    navigation.searchParams = new URLSearchParams();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("donne à chaque carte une destination interne unique et aucune action externe", () => {
    render(<CandidacyCard candidacy={candidacy()} />);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute(
      "href",
      "/elections/presidentielle-2027/candidats/alix-dupont"
    );
    expect(links[0]).toHaveTextContent("Voir le suivi 2027");
  });

  it("rend portrait et logo quand ils existent", () => {
    render(
      <CandidacyCard
        candidacy={candidacy({
          photoUrl: "https://upload.wikimedia.org/photo.jpg",
          partyLogoUrl: "https://upload.wikimedia.org/logo.svg",
        })}
      />
    );
    expect(screen.getByRole("img", { hidden: true, name: "Alix Dupont" })).toBeInTheDocument();
    expect(
      document.querySelector('img[src="https://upload.wikimedia.org/logo.svg"]')
    ).not.toBeNull();
    expect(screen.getByText("Parti Test")).toBeInTheDocument();
  });

  it("rend les fallbacks portrait et logo", () => {
    const { container } = render(<CandidacyCard candidacy={candidacy()} />);
    expect(container).toHaveTextContent("AD");
    expect(container).toHaveTextContent("PT");
    expect(screen.getByText("Parti Test")).toBeInTheDocument();
  });

  it("distingue zéro proposition, programme identifié et propositions publiées", () => {
    render(
      <ul>
        <CandidacyCard candidacy={candidacy({ id: "a", candidateName: "Sans programme" })} />
        <CandidacyCard
          candidacy={candidacy({
            id: "b",
            candidateName: "Programme identifié",
            programmeAbsence: "non_depouille",
          })}
        />
        <CandidacyCard
          candidacy={candidacy({
            id: "c",
            candidateName: "Propositions publiées",
            measureCount: 8,
            themesCoveredCount: 3,
            programmeAbsence: null,
          })}
        />
      </ul>
    );
    expect(
      screen.getByText("Poligraph n'a identifié aucun programme publié à ce jour")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Programme identifié, aucune proposition encore publiée sur Poligraph")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Des propositions sont disponibles sur 3 thématiques")
    ).toBeInTheDocument();
  });

  it("sépare visuellement statut public et contenu disponible", () => {
    render(
      <CandidacyFieldBrowser
        candidacies={[
          candidacy({ id: "a", status: "DECLARE", measureCount: 0 }),
          candidacy({ id: "b", status: "RETIRE", measureCount: 2 }),
        ]}
      />
    );
    expect(screen.getByRole("group", { name: "Statut public" })).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", {
        name: "Afficher uniquement les personnes avec des propositions publiées",
      })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Candidatures annoncées (1)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Candidatures retirées (1)" })).toBeInTheDocument();
  });

  it("filtre le contenu sans changer le sens des compteurs de statut", () => {
    render(
      <CandidacyFieldBrowser
        candidacies={[
          candidacy({ id: "a", candidateName: "Sans proposition", status: "DECLARE" }),
          candidacy({
            id: "b",
            candidateName: "Avec proposition",
            status: "RETIRE",
            measureCount: 2,
          }),
        ]}
      />
    );
    const checkbox = screen.getByRole("checkbox");
    fireEvent.click(checkbox);
    expect(screen.getByRole("button", { name: "Candidatures annoncées (1)" })).toBeInTheDocument();
  });

  it("préserve les noms et partis longs sans tronquer le texte", () => {
    const { container } = render(
      <CandidacyCard
        candidacy={candidacy({
          candidateName: "Anne-Charlotte de la Très Longue Circonscription",
          partyLabel: "Rassemblement démocratique écologique et social pour les territoires",
        })}
      />
    );
    const heading = screen.getByRole("heading");
    expect(heading.className).toContain("break-words");
    expect(container).toHaveTextContent("Rassemblement démocratique écologique et social");
  });

  it("annule la synchronisation différée quand un statut est sélectionné", () => {
    vi.useFakeTimers();
    render(<CandidacyFieldBrowser candidacies={[candidacy()]} />);

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Alix" } });
    fireEvent.click(screen.getByRole("button", { name: "Personnalités pressenties (1)" }));
    act(() => vi.advanceTimersByTime(250));

    expect(navigation.replace).toHaveBeenCalledTimes(1);
    expect(navigation.replace).toHaveBeenCalledWith("?statut=pressenties&q=Alix", {
      scroll: false,
    });
  });

  it("synchronise la dernière saisie après le délai", () => {
    vi.useFakeTimers();
    render(<CandidacyFieldBrowser candidacies={[candidacy()]} />);

    const searchbox = screen.getByRole("searchbox");
    fireEvent.change(searchbox, { target: { value: "Ali" } });
    fireEvent.change(searchbox, { target: { value: "Alix" } });
    act(() => vi.advanceTimersByTime(249));
    expect(navigation.replace).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1));
    expect(navigation.replace).toHaveBeenCalledTimes(1);
    expect(navigation.replace).toHaveBeenCalledWith("?q=Alix", { scroll: false });
  });

  it("annule la synchronisation différée quand le filtre de propositions change", () => {
    vi.useFakeTimers();
    render(<CandidacyFieldBrowser candidacies={[candidacy()]} />);

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Alix" } });
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Afficher uniquement les personnes avec des propositions publiées",
      })
    );
    act(() => vi.advanceTimersByTime(250));

    expect(navigation.replace).toHaveBeenCalledTimes(1);
    expect(navigation.replace).toHaveBeenCalledWith("?q=Alix&propositions=publiees", {
      scroll: false,
    });
  });

  it("annule la synchronisation différée avant d'ouvrir une fiche candidate", () => {
    vi.useFakeTimers();
    render(<CandidacyFieldBrowser candidacies={[candidacy()]} />);

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Alix" } });
    const link = screen.getByRole("link", { name: /Voir le suivi 2027/ });
    link.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(link);
    act(() => vi.advanceTimersByTime(250));

    expect(navigation.replace).not.toHaveBeenCalled();
  });
});
