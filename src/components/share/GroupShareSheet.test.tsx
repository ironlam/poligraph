import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { GroupShareSheet } from "./GroupShareSheet";

const data = {
  title: "Groupe d'exemple",
  text: "Groupe d'exemple : membres et votes",
  url: "https://poligraph.fr/parlement/groupes/gex-17",
};

const indicators = [
  { value: 87, suffix: " %", label: "de cohésion interne" },
  { value: 42, suffix: " %", label: "de votes identiques au groupe EPR" },
];

function open(
  seatCount: number,
  hemicycle: {
    placement: { before: number; seats: number; total: number };
    seatNoun: string;
  } | null = null,
  president: { fullName: string; role: string; photoUrl: string | null } | null = null
) {
  render(
    <GroupShareSheet
      slug="gex-17"
      data={data}
      name="Groupe d'exemple"
      subline="GEX · Assemblée nationale · 17e législature"
      color="#336699"
      president={president}
      seatCount={seatCount}
      hemicycle={hemicycle}
      indicators={indicators}
      scope="Scrutins de la 17e législature. Source : Assemblée nationale."
    />
  );
  fireEvent.click(screen.getByRole("button", { name: "Partager ce groupe" }));
  return screen.getByRole("img", { name: /Image à partager/ }).getAttribute("aria-label") ?? "";
}

describe("GroupShareSheet", () => {
  it("names the chamber and the legislature the group belongs to", () => {
    const name = open(64);
    expect(name).toContain("Groupe d'exemple, GEX · Assemblée nationale · 17e législature");
    expect(name).toContain("64 membres");
  });

  it("carries each percentage with what it compares, and the scope of the computation", () => {
    const name = open(64);
    expect(name).toContain("87 % de cohésion interne");
    expect(name).toContain("42 % de votes identiques au groupe EPR");
    expect(name).toContain("Scrutins de la 17e législature");
  });

  it("leaves the seat count off for a group with no sitting member", () => {
    const name = open(0);
    expect(name).not.toMatch(/membre/);
    expect(name).toContain("87 % de cohésion interne");
  });

  it("offers the link alone when there is neither a member nor an indicator to show", () => {
    render(
      <GroupShareSheet
        slug="gex-16"
        data={data}
        name="Groupe d'exemple"
        subline="GEX · Assemblée nationale · 16e législature"
        color={null}
        president={null}
        seatCount={0}
        hemicycle={null}
        indicators={[]}
        scope="Source : Assemblée nationale."
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Partager ce groupe" }));
    expect(screen.queryByRole("img", { name: /Image à partager/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Copier le lien" })).toBeInTheDocument();
  });

  it("names who presides the group, with the function and the year it started", () => {
    const name = open(64, null, {
      fullName: "Alix Exemple",
      role: "Présidente du groupe depuis 2024",
      photoUrl: null,
    });
    expect(name).toContain(
      "17e législature. Présidente du groupe depuis 2024 : Alix Exemple. 64 membres"
    );
  });

  it("says nothing about a presidency when none is known", () => {
    expect(open(64)).not.toMatch(/Présiden/);
  });

  it("says the hemicycle in words: seats, total and share", () => {
    const name = open(64, {
      placement: { before: 120, seats: 64, total: 575 },
      seatNoun: "députés",
    });
    expect(name).toContain("64 députés sur 575, soit 11 % des sièges pourvus");
  });
});
