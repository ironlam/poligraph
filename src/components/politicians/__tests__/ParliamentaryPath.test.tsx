import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MandateType } from "@/generated/prisma";
import { ParliamentaryPath } from "../ParliamentaryPath";
import type { ParliamentaryPathRow, PathMandate } from "@/lib/politicians/parliamentary-path";

function mandate(
  id: string,
  startDate: string,
  endDate: string | null,
  over: Partial<PathMandate> = {}
) {
  return {
    id,
    politicianId: "p1",
    type: MandateType.DEPUTE,
    startDate: new Date(startDate),
    endDate: endDate ? new Date(endDate) : null,
    isCurrent: false,
    constituency: "Essonne (1ère)",
    source: null,
    lastConfirmedAt: null,
    ...over,
  } satisfies PathMandate;
}

const consistent = (
  n: number,
  period: string,
  mandates: PathMandate[],
  total: number
): ParliamentaryPathRow => ({
  legislature: n,
  period,
  mandates,
  votes: { total },
  votesImported: true,
  datesStatus: { kind: "complete", reason: "CONSISTENT" },
});

const ROWS: ParliamentaryPathRow[] = [
  consistent(
    17,
    "depuis 2024",
    [mandate("m17", "2024-07-01", null, { isCurrent: true, source: "ASSEMBLEE_NATIONALE" })],
    9000
  ),
  consistent(16, "2022-2024", [mandate("m16", "2022-06-22", "2024-06-09")], 4000),
  {
    legislature: 15,
    period: "2017-2022",
    mandates: [mandate("m15", "2017-06-21", "2022-06-21")],
    votes: null,
    votesImported: false,
    datesStatus: { kind: "unverified", reason: "NOT_CROSS_CHECKED" },
  },
];

function renderPath(rows = ROWS) {
  return render(<ParliamentaryPath rows={rows} slug="camille-durand" fullName="Camille Durand" />);
}

describe("ParliamentaryPath", () => {
  it("ne rend rien sans législature", () => {
    const { container } = renderPath([]);

    expect(container).toBeEmptyDOMElement();
  });

  it("liste les législatures, la plus récente d'abord, dans un tableau nommé", () => {
    renderPath();

    const table = screen.getByRole("table", { name: "Parcours parlementaire de Camille Durand" });
    const rowHeaders = within(table)
      .getAllByRole("rowheader")
      .map((th) => th.textContent);
    expect(rowHeaders[0]).toContain("17e législature");
    expect(rowHeaders[1]).toContain("16e législature");
    expect(rowHeaders[2]).toContain("15e législature");
    expect(screen.getByRole("heading", { level: 2, name: "Parcours parlementaire" })).toBeVisible();
  });

  it("renvoie vers l'onglet Votes de la bonne législature, avec un nom accessible complet", () => {
    renderPath();

    const table = screen.getByRole("table");
    const link16 = within(table).getByRole("link", {
      name: /^Voir les 4\s000 votes de Camille Durand pendant la 16e législature$/,
    });
    expect(link16).toHaveAttribute("href", "/politiques/camille-durand/votes?legislature=16");
    expect(within(table).getByRole("link", { name: /pendant la 17e législature/ })).toHaveAttribute(
      "href",
      "/politiques/camille-durand/votes?legislature=17"
    );
  });

  it("dit qu'une législature sans votes importés n'est pas une absence de votes, sans lien", () => {
    renderPath();

    const table = screen.getByRole("table");
    expect(
      within(table).getByText(
        /Votes non importés pour cette législature\. Ce n'est pas une absence/
      )
    ).toBeVisible();
    expect(within(table).queryByRole("link", { name: /15e législature/ })).not.toBeInTheDocument();
  });

  it("écrit les périodes de mandat telles qu'enregistrées", () => {
    renderPath();

    const table = screen.getByRole("table");
    expect(within(table).getByText(/^depuis le 1 juillet 2024$/)).toBeVisible();
    expect(within(table).getByText(/^du 22 juin 2022 au 9 juin 2024$/)).toBeVisible();
  });

  it("nomme l'état des dates par un libellé et un statut, jamais par la couleur seule", () => {
    renderPath();

    const table = screen.getByRole("table");
    const statuses = Array.from(table.querySelectorAll("[data-status]")).map((el) => [
      el.getAttribute("data-status"),
      el.textContent,
    ]);
    expect(statuses[0]).toEqual(["complete", expect.stringContaining("Concordantes")]);
    expect(statuses[2]).toEqual(["unverified", expect.stringContaining("Non recoupées")]);
  });

  it.each([
    ["OVERLAPPING_MANDATES", /À vérifier/],
    ["VOTES_OUTSIDE_MANDATE", /À vérifier/],
    ["NO_MANDATE", /Mandat non enregistré/],
  ] as const)("signale les dates incertaines : %s", (reason, label) => {
    const row: ParliamentaryPathRow = {
      legislature: 16,
      period: "2022-2024",
      mandates: [],
      votes: { total: 12 },
      votesImported: true,
      datesStatus: { kind: "unverified", reason },
    };
    renderPath([row]);

    const table = screen.getByRole("table");
    const status = table.querySelector("[data-status='unverified']");
    expect(status).toHaveTextContent(label);
    // Un mandat absent se dit, il ne se remplit pas.
    expect(within(table).getByText("Mandat non enregistré dans PoliGraph")).toBeVisible();
  });

  it("montre la 16e d'une personne sans mandat de député, avec le lien vers ses votes", () => {
    const row: ParliamentaryPathRow = {
      legislature: 16,
      period: "2022-2024",
      mandates: [],
      votes: { total: 1066 },
      votesImported: true,
      datesStatus: { kind: "unverified", reason: "NO_MANDATE" },
    };
    renderPath([row]);

    const table = screen.getByRole("table");
    const line = within(table).getAllByRole("row")[1]!;
    expect(within(line).getByText("Mandat non enregistré dans PoliGraph")).toBeVisible();
    expect(line.querySelector("[data-status='unverified']")).toHaveTextContent(
      "Mandat non enregistré"
    );
    expect(
      within(line).getByRole("link", {
        name: /^Voir les 1\s066 votes de Camille Durand pendant la 16e législature$/,
      })
    ).toHaveAttribute("href", "/politiques/camille-durand/votes?legislature=16");
    // Rien n'est déduit des votes : ni circonscription, ni groupe.
    expect(within(line).getByText("Non renseignée")).toBeVisible();
    expect(line).not.toHaveTextContent(/groupe|parti/i);
  });

  it("n'affiche ni groupe ni parti : rien n'est reconstruit depuis l'affiliation actuelle", () => {
    renderPath();

    expect(screen.queryByText(/groupe/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/parti/i)).not.toBeInTheDocument();
  });

  it("attribue la source et n'utilise aucun tiret cadratin", () => {
    const { container } = renderPath();

    expect(screen.getByText("Assemblée nationale")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/[—–]/);
  });

  it("se rabat sur une attribution générique quand aucun mandat n'a de source", () => {
    renderPath([ROWS[1]!]);

    expect(screen.getByText("Mandats enregistrés dans PoliGraph")).toBeInTheDocument();
  });

  it("propose les mêmes informations en cartes pour le mobile", () => {
    renderPath();

    const cards = screen.getByRole("list", { name: "Parcours parlementaire de Camille Durand" });
    // Les listes imbriquées des périodes ne comptent pas : une carte par législature.
    expect(cards.querySelectorAll(":scope > li")).toHaveLength(3);
    expect(within(cards).getAllByRole("link")).toHaveLength(2);
  });
});
