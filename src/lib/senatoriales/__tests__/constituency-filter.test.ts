import { describe, expect, it } from "vitest";
import { matchesConstituency } from "../constituency-filter";

const ain = { code: "01", name: "Ain" };
const corseSud = { code: "2A", name: "Corse-du-Sud" };
const ariege = { code: "09", name: "Ariège" };
const abroad = { code: "ZZ", name: "Français établis hors de France" };

describe("matchesConstituency", () => {
  it("garde tout quand la recherche est vide", () => {
    expect(matchesConstituency("", ain)).toBe(true);
    expect(matchesConstituency("   ", abroad)).toBe(true);
  });

  it("trouve un nom sans tenir compte des accents ni de la casse", () => {
    expect(matchesConstituency("ariege", ariege)).toBe(true);
    expect(matchesConstituency("ARIÈGE", ariege)).toBe(true);
    expect(matchesConstituency("ariege", ain)).toBe(false);
  });

  it("traite tirets et espaces de la même façon", () => {
    expect(matchesConstituency("corse du sud", corseSud)).toBe(true);
  });

  it("trouve un numéro, avec ou sans zéro initial", () => {
    expect(matchesConstituency("01", ain)).toBe(true);
    expect(matchesConstituency("1", ain)).toBe(true);
    expect(matchesConstituency("9", ain)).toBe(false);
  });

  it("trouve la Corse par 2a, en minuscules", () => {
    expect(matchesConstituency("2a", corseSud)).toBe(true);
    expect(matchesConstituency("2b", corseSud)).toBe(false);
  });

  it("ne fait pas correspondre le code technique ZZ", () => {
    expect(matchesConstituency("zz", abroad)).toBe(false);
    expect(matchesConstituency("etablis hors", abroad)).toBe(true);
  });
});
