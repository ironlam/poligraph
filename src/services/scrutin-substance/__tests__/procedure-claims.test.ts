import { describe, expect, it } from "vitest";
import { buildProcedureFact, findProceduralOverclaims } from "../procedure-claims";

describe("buildProcedureFact", () => {
  const base = {
    scope: "PART",
    result: "REJECTED",
    chamber: "AN",
    dossierStatus: "REJETE_NAVETTE",
  } as const;

  it("rejet de la première partie d'une loi de finances : texte initial transmis au Sénat", () => {
    const fact = buildProcedureFact(base);
    expect(fact).toContain("considéré comme rejeté en première lecture");
    expect(fact).toContain("texte initial du Gouvernement est transmis au Sénat");
  });

  it.each([
    ["un vote sur le texte entier", { scope: "WHOLE" as const }],
    ["un vote adopté", { result: "ADOPTED" as const }],
    ["un vote du Sénat", { chamber: "SENAT" as const }],
    ["un dossier sans statut de navette", { dossierStatus: "EN_COURS" }],
    ["un dossier inconnu", { dossierStatus: null }],
  ])("ne dit rien pour %s", (_label, override) => {
    expect(buildProcedureFact({ ...base, ...override })).toBeNull();
  });
});

const codes = (text: string, opts: Parameters<typeof findProceduralOverclaims>[1]) =>
  findProceduralOverclaims(text, opts).map((c) => c.code);

describe("findProceduralOverclaims", () => {
  it("refuse les trois phrases du décryptage fautif du scrutin 9759", () => {
    const opts = { scope: "PART", hasProcedureFact: false } as const;
    expect(
      codes("Le projet de loi dans son intégralité proposait de valider le budget.", opts)
    ).toEqual(["PORTEE"]);
    expect(codes("Le gouvernement devra le modifier ou le représenter.", opts)).toEqual(["SUITE"]);
    expect(
      codes("Ce rejet bloque temporairement la définition du budget de l'État.", opts)
    ).toEqual(["SUITE"]);
  });

  it("refuse « en vigueur » quel que soit le vote", () => {
    expect(
      codes("La mesure entre en vigueur dès le 1er janvier.", {
        scope: "OTHER",
        hasProcedureFact: false,
      })
    ).toEqual(["EN_VIGUEUR"]);
    expect(
      codes("Cette règle sera en vigueur l'an prochain.", {
        scope: "WHOLE",
        hasProcedureFact: true,
      })
    ).toEqual(["EN_VIGUEUR"]);
  });

  it("n'applique le contrôle de portée qu'à un vote sur une partie ou un article", () => {
    const text = "Le projet de loi a été examiné dans son ensemble.";
    expect(codes(text, { scope: "WHOLE", hasProcedureFact: false })).toEqual([]);
    expect(codes(text, { scope: "PART", hasProcedureFact: false })).toEqual(["PORTEE"]);
    expect(codes(text, { scope: "ARTICLE", hasProcedureFact: false })).toEqual(["PORTEE"]);
  });

  it("accepte la suite de la procédure quand une donnée officielle la fournit", () => {
    const text =
      "Le texte entier est considéré comme rejeté en bloc. Le texte initial sera transmis au Sénat.";
    expect(codes(text, { scope: "PART", hasProcedureFact: true })).toEqual([]);
    expect(codes(text, { scope: "PART", hasProcedureFact: false }).sort()).toEqual([
      "PORTEE",
      "SUITE",
    ]);
  });

  it("laisse passer un texte qui s'en tient au résultat du vote", () => {
    expect(
      codes(
        "Les députés ont rejeté la première partie du projet de loi de finances : 458 voix contre, 2 abstentions.",
        { scope: "PART", hasProcedureFact: false }
      )
    ).toEqual([]);
  });

  it("ne confond pas une conséquence concrète d'une mesure avec la suite de la procédure", () => {
    expect(
      codes("Un propriétaire devra déclarer son bien à l'administration fiscale.", {
        scope: "OTHER",
        hasProcedureFact: false,
      })
    ).toEqual([]);
  });
});
