import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { ElectionTimeline } from "@/components/elections/ElectionTimeline";
import type { Election } from "@/types";

function makeElection(overrides: Partial<Election> & Pick<Election, "id" | "slug">): Election {
  return {
    publicId: null,
    type: "MUNICIPALES",
    title: "Élection",
    shortTitle: null,
    description: null,
    round1Date: null,
    round2Date: null,
    dateConfirmed: true,
    registrationDeadline: null,
    candidacyOpenDate: null,
    candidacyDeadline: null,
    campaignStartDate: null,
    scope: "MUNICIPAL",
    totalSeats: null,
    suffrage: "DIRECT",
    status: "UPCOMING",
    featured: false,
    decreeUrl: null,
    sourceUrl: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  } as Election;
}

const MUNICIPALES_2026 = makeElection({
  id: "e-muni-2026",
  slug: "municipales-2026",
  title: "Élections municipales de 2026",
  status: "COMPLETED",
  round1Date: new Date("2026-03-15T00:00:00Z"),
  round2Date: new Date("2026-03-22T00:00:00Z"),
});

const MUNICIPALES_2020 = makeElection({
  id: "e-muni-2020",
  slug: "municipales-2020",
  title: "Élections municipales de 2020",
  status: "COMPLETED",
  round1Date: new Date("2020-03-15T00:00:00Z"),
});

const SENATORIALES_2026 = makeElection({
  id: "e-senat-2026",
  slug: "senatoriales-2026",
  title: "Élections sénatoriales de 2026",
  type: "SENATORIALES",
  scope: "NATIONAL",
  suffrage: "INDIRECT",
  status: "UPCOMING",
  round1Date: new Date("2026-09-28T00:00:00Z"),
  dateConfirmed: false,
});

const REGIONALES_2028 = makeElection({
  id: "e-regio-2028",
  slug: "regionales-2028",
  title: "Élections régionales de 2028",
  type: "REGIONALES",
  scope: "REGIONAL",
  status: "UPCOMING",
});

function section(name: string) {
  return screen.getByRole("heading", { name, level: 2 }).closest("section")!;
}

describe("ElectionTimeline", () => {
  const elections = [MUNICIPALES_2020, MUNICIPALES_2026, SENATORIALES_2026, REGIONALES_2028];

  it("range une élection terminée dans la section des scrutins passés", () => {
    render(<ElectionTimeline elections={elections} />);

    expect(
      within(section("Élections passées")).getByText("Élections municipales de 2026")
    ).toBeInTheDocument();
    expect(
      within(section("Prochaines élections")).queryByText("Élections municipales de 2026")
    ).not.toBeInTheDocument();
  });

  it("place les scrutins à venir dans leur propre section, datés ou non", () => {
    render(<ElectionTimeline elections={elections} />);

    const upcoming = within(section("Prochaines élections"));
    expect(upcoming.getByText("Élections sénatoriales de 2026")).toBeInTheDocument();
    expect(upcoming.getByText("Élections régionales de 2028")).toBeInTheDocument();
  });

  it("affiche les élections passées de la plus récente à la plus ancienne", () => {
    render(<ElectionTimeline elections={elections} />);

    const titles = within(section("Élections passées"))
      .getAllByRole("link")
      .map((a) => a.textContent);

    expect(titles).toEqual(["Élections municipales de 2026", "Élections municipales de 2020"]);
  });

  it("n'affiche pas de section vide quand tous les scrutins sont passés", () => {
    render(<ElectionTimeline elections={[MUNICIPALES_2020, MUNICIPALES_2026]} />);

    expect(screen.queryByRole("heading", { name: "Prochaines élections" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Élections passées" })).toBeInTheDocument();
  });

  it("propose « Ajouter au calendrier » sur les scrutins à venir seulement", () => {
    render(<ElectionTimeline elections={elections} />);

    // Seules les sénatoriales sont à venir ET datées.
    expect(screen.getAllByLabelText("Ajouter au calendrier")).toHaveLength(1);
    expect(
      within(section("Élections passées")).queryByLabelText("Ajouter au calendrier")
    ).not.toBeInTheDocument();
  });
});
