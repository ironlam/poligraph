import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SeatsAtStake } from "../SeatsAtStake";
import { getBallotPhase } from "../../_content";

const GROUPS = [
  { groupName: "Les Républicains", shortName: "LR", color: null, held: 131, atStake: 77 },
  { groupName: "Union Centriste", shortName: "UC", color: null, held: 59, atStake: 30 },
  { groupName: "CRCE-K", shortName: null, color: null, held: 18, atStake: 4 },
];

describe("SeatsAtStake avant le scrutin", () => {
  it("rend l'exposition de chaque groupe, calculée et non citée", () => {
    render(<SeatsAtStake groups={GROUPS} phase="before" />);
    expect(screen.getByText("Ce qui est remis en jeu")).toBeInTheDocument();
    expect(screen.getByText("77")).toBeInTheDocument();
    expect(screen.getByText(/sur 131 sièges/)).toBeInTheDocument();
    expect(screen.getByText(/sur 18 sièges/)).toBeInTheDocument();
  });

  it("classe par nombre de sièges remis en jeu, pas par taille de groupe", () => {
    render(<SeatsAtStake groups={GROUPS} phase="before" />);
    const names = screen.getAllByRole("listitem").map((li) => li.textContent ?? "");
    expect(names[0]).toContain("Les Républicains");
    expect(names[2]).toContain("CRCE-K");
  });

  it("dit l'absence quand la série n'est pas encore renseignée", () => {
    render(<SeatsAtStake groups={[]} phase="before" />);
    expect(screen.getByText(/Répartition par groupe indisponible/)).toBeInTheDocument();
  });
});

/**
 * Régression : `getGroupExposure()` compte les mandats `isCurrent`. Le premier
 * `sync:senat` qui suit le 27 septembre remplace donc les sortants par les entrants, et
 * les barres décriraient le Sénat renouvelé sous un titre annonçant les sièges remis en
 * jeu. Rien n'échoue, la page se met simplement à mentir. Le bloc se retire.
 */
describe("SeatsAtStake après le scrutin", () => {
  it("ne présente plus la composition courante comme la composition sortante", () => {
    render(<SeatsAtStake groups={GROUPS} phase="after" />);
    expect(screen.getByText(/Composition sortante non conservée/)).toBeInTheDocument();
    expect(screen.queryByText("77")).toBeNull();
    expect(screen.queryByText(/sur 131 sièges/)).toBeNull();
    expect(screen.queryByText("Ce qui est remis en jeu")).toBeNull();
  });

  it("emploie le passé dans son titre", () => {
    render(<SeatsAtStake groups={GROUPS} phase="after" />);
    expect(screen.getByText("Ce qui était remis en jeu")).toBeInTheDocument();
  });
});

describe("getBallotPhase", () => {
  it("garde le futur avant le premier tour", () => {
    for (const status of ["UPCOMING", "REGISTRATION", "CANDIDACIES", "CAMPAIGN"] as const) {
      expect(getBallotPhase(status), status).toBe("before");
    }
  });

  it("passe au présent le jour du scrutin", () => {
    expect(getBallotPhase("ROUND_1")).toBe("polling-day");
  });

  it("passe au passé dès que le scrutin est derrière", () => {
    expect(getBallotPhase("BETWEEN_ROUNDS")).toBe("after");
    expect(getBallotPhase("COMPLETED")).toBe("after");
  });
});
