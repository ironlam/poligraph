import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HistoricalGroupPositions } from "@/components/votes/HistoricalGroupPositions";
import {
  buildHistoricalPositionsView,
  type HistoricalGroupRow,
  type HistoricalPositionsData,
  type HistoricalScrutinStatus,
} from "@/lib/votes/historical-positions";

const DATE = new Date("2023-11-13T23:00:00Z");

function row(overrides: Partial<HistoricalGroupRow> = {}): HistoricalGroupRow {
  return {
    organRef: "PO800490",
    label: "La France insoumise - Nouvelle Union Populaire écologique et sociale",
    abbreviation: "LFI - NUPES",
    forCount: 21,
    againstCount: 2,
    abstainCount: 1,
    nonVoterCount: 3,
    sameAbbreviationElsewhere: false,
    ...overrides,
  };
}

function status(overrides: Partial<HistoricalScrutinStatus> = {}): HistoricalScrutinStatus {
  return {
    legislature: 16,
    countCoherence: "COHERENT",
    groupsShown: 1,
    groupsWithheld: 0,
    withheldGroups: [],
    nonInscritVotes: 0,
    excludedConflictVotes: 0,
    excludedUnknownGroupVotes: 0,
    affiliationsUrl: "https://data.assemblee-nationale.fr/amo.zip",
    affiliationsFetchedAt: new Date("2026-10-18T21:26:12Z"),
    affiliationsAsOf: null,
    scrutinsUrl: "https://data.assemblee-nationale.fr/scrutins.zip",
    scrutinsFetchedAt: new Date("2026-10-18T22:03:56Z"),
    ...overrides,
  };
}

function renderView(data: HistoricalPositionsData, legislature = 16) {
  const view = buildHistoricalPositionsView({ legislature, data });
  return render(<HistoricalGroupPositions view={view} scrutinDate={DATE} />);
}

describe("HistoricalGroupPositions : décompte présenté", () => {
  it("titre daté, introduction sourcée, statut complet", () => {
    const { container } = renderView({ status: status(), rows: [row()] });
    expect(
      screen.getByRole("heading", { level: 3, name: /Votes par groupe le 14 novembre 2023/ })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Calculé par PoliGraph à partir des votes individuels publiés/)
    ).toBeInTheDocument();
    expect(container.querySelector('[data-status="complete"]')).toHaveTextContent(
      "Décompte par groupe : Complet"
    );
  });

  it("tableau accessible : légende, en-têtes de colonnes et de lignes", () => {
    renderView({ status: status(), rows: [row()] });
    const table = screen.getByRole("table");
    expect(
      within(table).getByText(/selon le groupe de chaque député le 14 novembre 2023/)
    ).toBeInTheDocument();
    const headers = within(table)
      .getAllByRole("columnheader")
      .map((h) => h.textContent);
    expect(headers).toEqual(["Groupe", "Pour", "Contre", "Abstentions", "Non-votants"]);
    const rowHeader = within(table).getByRole("rowheader");
    expect(rowHeader).toHaveTextContent("La France insoumise");
    const cells = within(table)
      .getAllByRole("cell")
      .map((c) => c.textContent);
    expect(cells).toEqual(["21", "2", "1", "3"]);
    // La région défilante est atteignable au clavier et nommée.
    expect(screen.getByRole("region", { name: "Votes par groupe" })).toHaveAttribute(
      "tabindex",
      "0"
    );
  });

  it("les chiffres existent en texte, la barre est décorative", () => {
    const { container } = renderView({ status: status(), rows: [row()] });
    for (const bar of container.querySelectorAll('[data-testid="position-count-bar"]')) {
      expect(bar).toHaveAttribute("aria-hidden", "true");
    }
    // Version mobile : les quatre décomptes sont écrits.
    const list = screen.getByRole("list", { name: "Votes par groupe" });
    const counts = [...list.querySelectorAll("[data-count]")].map((item) => item.textContent);
    expect(counts).toEqual(["Pour21", "Contre2", "Abstentions1", "Non-votants3"]);
    // The hyphen of « Non-votants » must not be a line break on a narrow screen.
    expect(list.querySelector('[data-count="non-votants"]')).toHaveClass("whitespace-nowrap");
  });

  it("n'affiche aucune position majoritaire", () => {
    const { container } = renderView({ status: status(), rows: [row()] });
    expect(container.textContent).not.toMatch(/Position majoritaire/);
    expect(container.textContent).not.toMatch(/Position calculée/);
    // La précision méthodologique, elle, le dit explicitement.
    expect(container.textContent).toContain("PoliGraph n'en tire aucune position majoritaire");
  });

  it("explique la différence entre vote individuel, agrégation par groupe et position", () => {
    renderView({ status: status(), rows: [row()] });
    const details = screen.getByText("Comment lire ces chiffres").closest("details");
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute("open");
    expect(
      within(details as HTMLElement).getByText(/celui que le référentiel de l'Assemblée nationale/)
    ).toBeInTheDocument();
    // What the Assemblée files under « Non votant » (members of the Government, the person
    // presiding), checked on its scrutin pages: the reader must not take it for absence.
    expect(
      within(details as HTMLElement).getByText(/membres du Gouvernement et la personne qui préside/)
    ).toBeInTheDocument();
    expect(
      within(details as HTMLElement).getByRole("link", { name: "Méthodologie" })
    ).toHaveAttribute("href", "/methodologie#votes-historiques-des-groupes");
  });

  it("source : deux jeux de données de l'Assemblée, date de consultation, signalement", () => {
    renderView({ status: status(), rows: [row()] });
    const links = screen.getAllByRole("link").map((a) => [a.textContent, a.getAttribute("href")]);
    expect(links).toContainEqual([
      "Assemblée nationale, Scrutins (données ouvertes)",
      "https://data.assemblee-nationale.fr/scrutins.zip",
    ]);
    expect(links).toContainEqual([
      "Assemblée nationale, acteurs, mandats et organes (données ouvertes)",
      "https://data.assemblee-nationale.fr/amo.zip",
    ]);
    expect(screen.getByText(/Consulté le 19 octobre 2026/)).toBeInTheDocument();
    expect(screen.getByText(/Décompte calculé par PoliGraph/)).toBeInTheDocument();
  });

  it("source : la date d'arrêt du fichier des groupes, quand elle existe", () => {
    renderView({
      status: status({ affiliationsAsOf: new Date("2026-10-17T00:34:00Z") }),
      rows: [row()],
    });
    expect(screen.getByText(/Groupes et mandats arrêtés au 17 octobre 2026/)).toBeInTheDocument();
  });

  it("source : pas de date d'arrêt inventée quand le fichier n'en porte pas", () => {
    renderView({ status: status({ affiliationsAsOf: null }), rows: [row()] });
    expect(screen.queryByText(/arrêtés au/)).toBeNull();
  });

  it("présentation partielle : statut, raisons par groupe, votes exclus, non-inscrits", () => {
    const { container } = renderView({
      status: status({
        groupsWithheld: 2,
        withheldGroups: [
          { label: "Renaissance", abbreviation: "RE", reason: "EXCLUDED_VOTES_PRESENT" },
          { label: "Les Républicains", abbreviation: "LR", reason: "NO_ATTESTED_VOTE" },
        ],
        excludedConflictVotes: 1,
        nonInscritVotes: 4,
      }),
      rows: [row()],
    });
    expect(container.querySelector('[data-status="partial"]')).toHaveTextContent(
      "Décompte par groupe : Partiel"
    );
    const withheld = screen.getByRole("heading", { level: 4, name: "Groupes non présentés" })
      .parentElement as HTMLElement;
    expect(
      within(withheld).getByText(/au moins un de ses votes n'a pas pu être rattaché/)
    ).toBeInTheDocument();
    expect(
      within(withheld).getByText(/aucun vote pour, contre ou abstention n'est attesté/)
    ).toBeInTheDocument();
    expect(screen.getByText(/1 vote n'est compté dans aucun groupe/)).toBeInTheDocument();
    expect(
      screen.getByText(
        /ne forment pas un groupe : 4 votes de députés non inscrits ne figurent dans aucune ligne/
      )
    ).toBeInTheDocument();
  });

  it("groupe renommé : les deux lignes restent distinctes, avec la mise en garde", () => {
    renderView({
      status: status({ groupsShown: 2 }),
      rows: [
        row({
          organRef: "PO1",
          label: "Socialistes et apparentés",
          abbreviation: "SOC",
          sameAbbreviationElsewhere: true,
        }),
        row({
          organRef: "PO2",
          label: "Socialistes et apparentés (apparenté)",
          abbreviation: "SOC",
          sameAbbreviationElsewhere: true,
        }),
      ],
    });
    expect(within(screen.getByRole("table")).getAllByRole("rowheader")).toHaveLength(2);
    expect(screen.getByText(/désigne deux références de groupe/)).toBeInTheDocument();
  });
});

describe("HistoricalGroupPositions : cas où rien n'est présenté", () => {
  it("décomptes discordants : explication, aucun tableau, aucun chiffre de groupe", () => {
    const { container } = renderView({
      status: status({ countCoherence: "COUNT_MISMATCH" }),
      rows: [row()],
    });
    expect(screen.getByText("Décompte par groupe non présenté")).toBeInTheDocument();
    expect(
      screen.getByText(/ne correspond pas aux totaux que l'Assemblée nationale publie/)
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
    expect(container.textContent).not.toContain("La France insoumise");
  });

  it("totaux non vérifiables : message distinct", () => {
    renderView({ status: status({ countCoherence: "UNVERIFIABLE" }), rows: [] });
    expect(
      screen.getByText(/ne permettent pas de vérifier les votes individuels/)
    ).toBeInTheDocument();
  });

  it("aucun groupe présentable : les raisons sont lisibles", () => {
    renderView({
      status: status({
        groupsShown: 0,
        groupsWithheld: 1,
        withheldGroups: [
          { label: "Renaissance", abbreviation: "RE", reason: "EXCLUDED_VOTES_PRESENT" },
        ],
      }),
      rows: [],
    });
    expect(screen.getByText("Aucun groupe présentable pour ce scrutin")).toBeInTheDocument();
    expect(
      screen.getByText(/au moins un de ses votes n'a pas pu être rattaché/)
    ).toBeInTheDocument();
  });

  it("historique indisponible : dit que ce n'est pas une absence de vote", () => {
    renderView({ status: null, rows: [] });
    expect(screen.getByText("Votes par groupe pas encore disponibles")).toBeInTheDocument();
    expect(screen.getByText(/Ce n'est pas une absence de vote/)).toBeInTheDocument();
  });

  it("législature non documentée : jamais de repli vers l'affiliation actuelle", () => {
    const { container } = renderView({ status: status(), rows: [row()] }, 14);
    expect(screen.getByText("Votes par groupe pas encore documentés")).toBeInTheDocument();
    expect(container.textContent).not.toContain("groupe actuel");
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("lecture en échec : message neutre, le reste de la page reste affiché", () => {
    renderView({ unreadable: true });
    expect(screen.getByText("Décompte par groupe momentanément indisponible")).toBeInTheDocument();
    expect(screen.getByText(/restent affichés/)).toBeInTheDocument();
  });
});

describe("HistoricalGroupPositions : textes visibles", () => {
  it("aucun tiret long ni accent omis dans aucun état", () => {
    const states: HistoricalPositionsData[] = [
      {
        status: status({
          nonInscritVotes: 2,
          excludedConflictVotes: 2,
          groupsWithheld: 1,
          withheldGroups: [{ label: "X", abbreviation: null, reason: "EXCLUDED_VOTES_PRESENT" }],
        }),
        rows: [row()],
      },
      { status: status({ countCoherence: "COUNT_MISMATCH" }), rows: [] },
      { status: status({ countCoherence: "UNVERIFIABLE" }), rows: [] },
      { status: status({ groupsShown: 0 }), rows: [] },
      { status: null, rows: [] },
      { unreadable: true },
    ];
    for (const data of states) {
      const { container, unmount } = renderView(data);
      const text = container.textContent ?? "";
      expect(text).not.toMatch(/[–—]/);
      for (const wrong of ["egalement", "elus", "criteres", "deputes", "Assemblee"]) {
        expect(text).not.toContain(wrong);
      }
      unmount();
    }
  });
});
