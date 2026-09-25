import { describe, expect, it } from "vitest";
import { isAttributedClaim } from "../claim-attribution";

/**
 * The case that started this: the fiche Mélenchon published "La transition écologique s'appuie
 * sur la création d'un pôle public de l'énergie", a present indicative that reads as a
 * description of France rather than of what a candidacy proposes.
 */
describe("isAttributedClaim", () => {
  it.each([
    "La transition écologique s'appuie sur la création d'un pôle public de l'énergie.",
    "Les premières consommations d'eau, d'électricité et de gaz sont rendues gratuites.",
    "L'éducation et la culture sont recentrées sur la gratuité et l'égalité d'accès.",
    "La justice retrouve les moyens de fonctionner.",
  ])("rejette %j", (claim) => {
    expect(isAttributedClaim(claim)).toBe(false);
  });

  it.each([
    "Le programme fonde la transition écologique sur un pôle public de l'énergie.",
    "Les mesures associent la renationalisation d'EDF et la gestion de l'eau en régies.",
    "La candidature propose la gratuité des premières consommations d'eau.",
    "Le projet rend les manuels scolaires gratuits.",
    "Sur l'énergie, les mesures associent renationalisation et régies publiques locales.",
    "En matière de logement, le programme encadre les loyers.",
  ])("accepte %j", (claim) => {
    expect(isAttributedClaim(claim)).toBe(true);
  });

  it.each([
    "L'eau devient gratuite, le programme le prévoit.",
    "Les loyers sont encadrés, les mesures le disent.",
    "La transition écologique s'appuie sur un pôle public de l'énergie et sur des régies locales, le programme le prévoit.",
  ])("ne se laisse pas racheter par une proposition attributive en fin de phrase : %j", (claim) => {
    // Le trou que ça ferme : un complément quelconque de moins de 60 caractères servait de
    // laissez-passer, alors que sa première proposition affirmait déjà. Un complément est
    // « Sur l'énergie, », jamais une proposition conjuguée.
    expect(isAttributedClaim(claim)).toBe(false);
  });

  it("tolère une espace de tête, que le fournisseur ajoute parfois", () => {
    expect(isAttributedClaim("  Le programme encadre les loyers.")).toBe(true);
  });
});
