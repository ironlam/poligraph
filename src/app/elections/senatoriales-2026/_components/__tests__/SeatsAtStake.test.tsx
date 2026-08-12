import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SeatsAtStake } from "../SeatsAtStake";
import { getBallotPhase } from "../../_content";

const GROUPS = [
  { groupName: "Les Républicains", shortName: "LR", color: "#0066CC", held: 131, atStake: 77 },
  { groupName: "Union Centriste", shortName: "UC", color: "#FF9900", held: 59, atStake: 30 },
  { groupName: "CRCE-K", shortName: null, color: null, held: 18, atStake: 4 },
];
const EXPOSURE = { groups: GROUPS, unattributedAtStake: 0, isConsistent: true };

describe("SeatsAtStake avant le scrutin", () => {
  it("rend l'exposition de chaque groupe, calculée et non citée", () => {
    render(<SeatsAtStake exposure={EXPOSURE} phase="before" />);
    expect(screen.getByText("Ce qui est remis en jeu")).toBeInTheDocument();
    expect(screen.getByText("77")).toBeInTheDocument();
    expect(screen.getByText(/sur 131 sièges/)).toBeInTheDocument();
    expect(screen.getByText(/sur 18 sièges/)).toBeInTheDocument();
  });

  it("classe par nombre de sièges remis en jeu, pas par taille de groupe", () => {
    render(<SeatsAtStake exposure={EXPOSURE} phase="before" />);
    const names = screen.getAllByRole("listitem").map((li) => li.textContent ?? "");
    expect(names[0]).toContain("Les Républicains");
    expect(names[2]).toContain("CRCE-K");
  });

  it("dit l'absence quand la série n'est pas encore renseignée", () => {
    render(
      <SeatsAtStake
        exposure={{ groups: [], unattributedAtStake: 178, isConsistent: true }}
        phase="before"
      />
    );
    expect(screen.getByText(/Répartition par groupe indisponible/)).toBeInTheDocument();
  });

  /**
   * `ParliamentaryGroup.color` était sélectionné par la requête, typé dans `GroupExposure`,
   * puis jamais rendu : les neuf barres sortaient de la même couleur et se lisaient comme
   * une seule série. Même règle pour tous les groupes, chacun la sienne.
   */
  it("donne à chaque barre la couleur du groupe", () => {
    const { container } = render(<SeatsAtStake exposure={EXPOSURE} phase="before" />);
    const bars = [...container.querySelectorAll("li div[style]")];
    expect(bars).toHaveLength(3);
    expect(bars[0]!.getAttribute("style")).toContain("rgb(0, 102, 204)");
    expect(bars[1]!.getAttribute("style")).toContain("rgb(255, 153, 0)");
  });

  it("retombe sur la couleur de marque pour un groupe sans couleur, jamais sur celle d'un autre", () => {
    const { container } = render(<SeatsAtStake exposure={EXPOSURE} phase="before" />);
    const bars = [...container.querySelectorAll("li div[style]")];
    // CRCE-K porte color: null dans la fixture.
    expect(bars[2]!.getAttribute("style")).not.toContain("rgb(");
    expect(bars[2]!.className).toContain("bg-brand-on-surface");
  });

  it("laisse un siège vacant sans groupe inventé", () => {
    render(
      <SeatsAtStake
        exposure={{ groups: GROUPS, unattributedAtStake: 1, isConsistent: true }}
        phase="before"
      />
    );
    expect(screen.getByText("Non attribué à un groupe dans nos données")).toBeInTheDocument();
    expect(screen.getByText(/Siège vacant ou mandat sans série ou groupe renseigné/)).toBeVisible();
    expect(screen.getAllByRole("listitem")).toHaveLength(GROUPS.length + 1);
  });

  it("retire une ventilation qui dépasse le total statutaire", () => {
    render(
      <SeatsAtStake
        exposure={{ groups: GROUPS, unattributedAtStake: 0, isConsistent: false }}
        phase="before"
      />
    );
    expect(screen.getByText("Répartition par groupe incohérente")).toBeInTheDocument();
    expect(screen.queryByText("77")).toBeNull();
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
    render(<SeatsAtStake exposure={EXPOSURE} phase="after" />);
    expect(screen.getByText(/Comparaison avant et après non encore publiée/)).toBeInTheDocument();
    expect(screen.queryByText("77")).toBeNull();
    expect(screen.queryByText(/sur 131 sièges/)).toBeNull();
    expect(screen.queryByText("Ce qui est remis en jeu")).toBeNull();
  });

  /**
   * Régression sur la véracité du `MissingData` lui-même.
   *
   * Une version antérieure titrait « Composition sortante non conservée ». C'est devenu faux
   * le jour où la capture a tourné (clé write-once `senatoriales-2026-outgoing-composition`,
   * 10 août 2026, 178 sièges), et cette phrase se serait affichée à partir du 28 septembre
   * comme une affirmation fausse sur nos propres données. Une absence affichée doit rester
   * vraie après les lots suivants.
   */
  it("n'affirme pas que la composition sortante a été perdue, puisqu'elle est relevée", () => {
    const { container } = render(<SeatsAtStake exposure={EXPOSURE} phase="after" />);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/non conservée/i);
    expect(text).not.toMatch(/n'a pas été (conservée|relevée|capturée)/i);
    expect(text).toMatch(/relevée avant le scrutin/i);
  });

  it("emploie le passé dans son titre", () => {
    render(<SeatsAtStake exposure={EXPOSURE} phase="after" />);
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
