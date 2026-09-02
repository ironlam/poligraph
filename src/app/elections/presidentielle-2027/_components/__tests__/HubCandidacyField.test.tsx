import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HubCandidacy } from "@/lib/data/hub";
import { CandidacyCard, CandidacyFieldBrowser } from "../CandidacyFieldBrowser";

const navigation = vi.hoisted(() => ({
  searchParams: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => navigation.searchParams,
  usePathname: () => "/elections/presidentielle-2027/candidats",
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
    navigation.searchParams = new URLSearchParams();
    window.history.replaceState(null, "", "/elections/presidentielle-2027/candidats");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("donne à chaque carte une destination interne unique et aucune action externe", () => {
    render(<CandidacyCard candidacy={candidacy()} />);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute(
      "href",
      "/elections/presidentielle-2027/candidats/alix-dupont"
    );
    expect(links[0]).toHaveTextContent("Alix Dupont");
  });

  it("rend le portrait et donne de l'importance au parti", () => {
    const { container } = render(
      <CandidacyCard
        candidacy={candidacy({
          photoUrl: "https://upload.wikimedia.org/photo.jpg",
          partyLogoUrl: "https://upload.wikimedia.org/logo.svg",
        })}
      />
    );
    expect(screen.getByAltText("Alix Dupont").parentElement?.parentElement).toHaveAttribute(
      "aria-hidden",
      "true"
    );
    expect(screen.getByText("Parti Test")).toBeInTheDocument();
    expect(container.querySelector('img[alt=""]')).not.toBeNull();
  });

  it("rend le fallback du portrait", () => {
    const { container } = render(<CandidacyCard candidacy={candidacy()} />);
    expect(container).toHaveTextContent("AD");
    expect(screen.getByText("Parti Test")).toBeInTheDocument();
  });

  it("remplace un logo de parti inaccessible par ses initiales", () => {
    const { container } = render(
      <CandidacyCard
        candidacy={candidacy({ partyLogoUrl: "https://example.org/logo-inaccessible.svg" })}
      />
    );

    fireEvent.error(container.querySelector('img[alt=""]')!);
    expect(screen.getByText("PT")).toBeInTheDocument();
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
    expect(screen.getByText("Programme non trouvé ou pas encore traité")).toBeInTheDocument();
    expect(screen.getByText("Programme repéré, traitement en cours")).toBeInTheDocument();
    expect(screen.getByText("8 mesures · 3 thèmes")).toBeInTheDocument();
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
        name: "Avec des propositions publiées",
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
    expect(
      screen.getByText("Anne-Charlotte de la Très Longue Circonscription").className
    ).toContain("break-words");
    expect(container).toHaveTextContent("Rassemblement démocratique écologique et social");
  });

  it("annule la synchronisation différée quand un statut est sélectionné", () => {
    vi.useFakeTimers();
    const replaceState = vi.spyOn(window.history, "replaceState");
    render(<CandidacyFieldBrowser candidacies={[candidacy()]} />);

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Alix" } });
    fireEvent.click(screen.getByRole("button", { name: "Personnalités pressenties (1)" }));
    act(() => vi.advanceTimersByTime(250));

    expect(replaceState).toHaveBeenCalledTimes(1);
    expect(replaceState).toHaveBeenCalledWith(
      null,
      "",
      "/elections/presidentielle-2027/candidats?statut=pressenties&q=Alix"
    );
  });

  it("synchronise la dernière saisie après le délai", () => {
    vi.useFakeTimers();
    const replaceState = vi.spyOn(window.history, "replaceState");
    render(<CandidacyFieldBrowser candidacies={[candidacy()]} />);

    const searchbox = screen.getByRole("searchbox");
    fireEvent.change(searchbox, { target: { value: "Ali" } });
    fireEvent.change(searchbox, { target: { value: "Alix" } });
    act(() => vi.advanceTimersByTime(249));
    expect(replaceState).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1));
    expect(replaceState).toHaveBeenCalledTimes(1);
    expect(replaceState).toHaveBeenCalledWith(
      null,
      "",
      "/elections/presidentielle-2027/candidats?q=Alix"
    );
  });

  it("annule la synchronisation différée quand le filtre de propositions change", () => {
    vi.useFakeTimers();
    const replaceState = vi.spyOn(window.history, "replaceState");
    render(<CandidacyFieldBrowser candidacies={[candidacy()]} />);

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Alix" } });
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Avec des propositions publiées",
      })
    );
    act(() => vi.advanceTimersByTime(250));

    expect(replaceState).toHaveBeenCalledTimes(1);
    expect(replaceState).toHaveBeenCalledWith(
      null,
      "",
      "/elections/presidentielle-2027/candidats?q=Alix&propositions=publiees"
    );
  });

  it("annule la synchronisation différée avant d'ouvrir une fiche candidate", () => {
    vi.useFakeTimers();
    const replaceState = vi.spyOn(window.history, "replaceState");
    render(<CandidacyFieldBrowser candidacies={[candidacy()]} />);

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Alix" } });
    const link = screen.getByRole("link", { name: /Alix Dupont/ });
    link.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(link);
    act(() => vi.advanceTimersByTime(250));

    expect(replaceState).not.toHaveBeenCalled();
  });

  it("annonce le nombre de résultats et permet de réinitialiser les filtres", () => {
    render(
      <CandidacyFieldBrowser
        candidacies={[
          candidacy({ id: "a", candidateName: "Alix Dupont" }),
          candidacy({ id: "b", candidateName: "Béatrice Martin" }),
        ]}
      />
    );

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Béatrice" } });
    expect(screen.getByText("1 personnalité affichée")).toHaveAttribute("aria-live", "polite");
    fireEvent.click(screen.getByRole("button", { name: "Réinitialiser les filtres" }));
    expect(screen.getByText("2 personnalités affichées")).toBeInTheDocument();
  });
});
