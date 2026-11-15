import { describe, expect, it } from "vitest";
import {
  municipalSeatsUpdate,
  parseFrenchPct,
  parseWideResultRow2026,
  withDecidedSeats,
} from "../parse-wide-results-2026";

describe("parseFrenchPct", () => {
  it("lit un pourcentage français", () => {
    expect(parseFrenchPct("55,08%")).toBe(55.08);
    expect(parseFrenchPct("100,00%")).toBe(100);
  });

  it("rend 0 sur une cellule vide", () => {
    expect(parseFrenchPct("")).toBe(0);
    expect(parseFrenchPct("   ")).toBe(0);
  });

  /**
   * `replace("%", "")` ne retirait que la première occurrence. Sur une cellule doublement
   * préfixée, le `%` restant ouvrait la chaîne, `parseFloat` rendait NaN et le `|| 0` le
   * transformait en zéro : un taux de participation nul, sans erreur ni trace.
   *
   * Cas non observé dans les fichiers reçus, mais le mode de défaillance est muet, donc le
   * constater coûte moins cher que le découvrir sur une page publiée.
   */
  it("retire tous les signes pourcent, pas seulement le premier", () => {
    expect(parseFrenchPct("%%55,08")).toBe(55.08);
    expect(parseFrenchPct("55,08%%")).toBe(55.08);
  });
});

describe("parseWideResultRow2026 : quart des inscrits (art. L. 262)", () => {
  function row(registered: string, votes: string, pctExpressed: string) {
    const fixed = Array(18).fill("");
    fixed[2] = "31555";
    fixed[3] = "Ville";
    fixed[4] = registered;
    // panel, name, first name, sex, nuance, short label, label, votes, %reg, %expr, elu, CM, CC
    const block = [
      "1",
      "DUPONT",
      "Jean",
      "M",
      "DVG",
      "A",
      "LISTE A",
      votes,
      "0",
      pctExpressed,
      "",
      "",
      "",
    ];
    return [...fixed, ...block];
  }

  it("n'élit pas une liste à plus de 50 % des exprimés sous le quart des inscrits", () => {
    const r = parseWideResultRow2026(row("5000", "1000", "65,79%"));
    expect(r.lists[0]?.isElected).toBe(false);
  });

  it("élit une liste qui atteint le quart des inscrits", () => {
    const r = parseWideResultRow2026(row("5000", "1250", "82,24%"));
    expect(r.lists[0]?.isElected).toBe(true);
  });
});

describe("parseWideResultRow2026 : sièges au conseil municipal", () => {
  function rowWithSeats(seatsCM: string) {
    const fixed = Array(18).fill("");
    fixed[2] = "01160";
    fixed[3] = "Ville";
    fixed[4] = "1000";
    // panel, name, first name, sex, nuance, short label, label, votes, %reg, %expr, elu, CM, CC
    const block = [
      "1",
      "DUPONT",
      "Jean",
      "M",
      "LDIV",
      "LISTE",
      "Liste A",
      "400",
      "40",
      "60",
      "",
      seatsCM,
      "",
    ];
    return parseWideResultRow2026([...fixed, ...block]);
  }

  it("lit le nombre de sièges de la liste", () => {
    expect(rowWithSeats("28").lists[0]?.seatsCM).toBe(28);
    expect(municipalSeatsUpdate(rowWithSeats("28").lists[0]!)).toEqual({ municipalSeats: 28 });
  });

  // First-round file of a commune decided at the second round: the cell is empty. Writing null
  // would erase the seats set from the second-round file.
  it("n'écrit rien quand le fichier ne donne pas de sièges, au lieu d'effacer", () => {
    expect(rowWithSeats("").lists[0]?.seatsCM).toBeNull();
    expect(municipalSeatsUpdate(rowWithSeats("").lists[0]!)).toEqual({});
  });

  // Rennes, first-round file of 2026: eleven lists, "0" seat on each, then 6, 44 and 11 seats
  // in the second-round file. Importing those zeros after the second round would erase them.
  it("ne prend pas pour un résultat les zéros d'une commune partie au second tour", () => {
    const fixed = Array(18).fill("");
    fixed[2] = "35238";
    const block = (seats: string) => [
      "1",
      "N",
      "P",
      "M",
      "LDIV",
      "L",
      "Liste",
      "9",
      "9",
      "9",
      "",
      seats,
      "",
    ];
    const undecided = withDecidedSeats(
      parseWideResultRow2026([...fixed, ...block("0"), ...block("0")])
    );
    expect(undecided.lists.map((l) => l.seatsCM)).toEqual([null, null]);
    expect(undecided.lists.map(municipalSeatsUpdate)).toEqual([{}, {}]);

    const decided = withDecidedSeats(
      parseWideResultRow2026([...fixed, ...block("44"), ...block("0")])
    );
    expect(decided.lists.map((l) => l.seatsCM)).toEqual([44, 0]);
  });

  it("garde un zéro publié : une liste sans siège n'est pas une liste sans donnée", () => {
    expect(municipalSeatsUpdate(rowWithSeats("0").lists[0]!)).toEqual({ municipalSeats: 0 });
  });
});
