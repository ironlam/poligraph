import { describe, expect, it } from "vitest";
import {
  buildProcedureFact,
  findDecisionCodeForVote,
  findProceduralOverclaims,
} from "../procedure-claims";

describe("findDecisionCodeForVote", () => {
  const timeline = [
    {
      code: "AN1",
      label: "1ère lecture",
      date: null,
      chamber: "AN",
      children: [
        {
          code: "AN1-DEBATS",
          label: "Discussion",
          date: null,
          chamber: "AN",
          children: [
            { code: "AN1-DEBATS-SEANCE", label: "Séance", date: "2026-11-04", chamber: "AN" },
            {
              code: "AN1-DEBATS-DEC",
              label: "Décision",
              date: "2026-11-04",
              chamber: "AN",
              voteRefs: ["VTANR5L17V9759"],
            },
          ],
        },
      ],
    },
  ];

  it("retrouve le code de la décision qui cite ce scrutin, même imbriquée", () => {
    expect(findDecisionCodeForVote(timeline, "VTANR5L17V9759")).toBe("AN1-DEBATS-DEC");
  });

  it("ne retrouve rien pour un autre scrutin du même dossier", () => {
    expect(findDecisionCodeForVote(timeline, "VTANR5L17V9000")).toBeNull();
  });

  it("tolère une timeline absente ou invalide", () => {
    expect(findDecisionCodeForVote(null, "VTANR5L17V9759")).toBeNull();
    expect(findDecisionCodeForVote({ pas: "un tableau" }, "VTANR5L17V9759")).toBeNull();
  });
});

describe("buildProcedureFact", () => {
  const base = {
    scope: "PART",
    result: "REJECTED",
    chamber: "AN",
    dossierStatus: "REJETE_NAVETTE",
    decisionCode: "AN1-DEBATS-DEC",
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
    // Codex P1 : le statut courant du dossier ne dit rien de CE vote.
    ["un vote que la décision du dossier ne cite pas", { decisionCode: null }],
    ["une partie votée en 2e lecture", { decisionCode: "AN2-DEBATS-DEC" }],
    ["une décision du Sénat", { decisionCode: "SN1-DEBATS-DEC" }],
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

  it("refuse « entre en vigueur » sous ses formes réellement observées en base", () => {
    const opts = { scope: "OTHER", hasProcedureFact: false } as const;
    expect(codes("Cela signifie que cette mesure entre en vigueur.", opts)).toEqual(["EN_VIGUEUR"]);
    expect(codes("La taxe entrera donc en vigueur dès 2027.", opts)).toEqual(["EN_VIGUEUR"]);
    expect(codes("L'obligation entre désormais en vigueur.", opts)).toEqual(["EN_VIGUEUR"]);
  });

  it("ne prend pas le vocabulaire d'une mesure d'amendement pour une spéculation de procédure", () => {
    const opts = { scope: "OTHER", hasProcedureFact: false } as const;
    expect(codes("L'amendement propose un blocage temporaire des loyers.", opts)).toEqual([]);
    expect(codes("Il bloque les prix pendant les négociations commerciales.", opts)).toEqual([]);
    expect(codes("Ce dispositif est essentiel pour les agriculteurs, dit l'auteur.", opts)).toEqual(
      []
    );
    expect(codes("Le produit sera soumis à une taxe de 2 %.", opts)).toEqual([]);
    // La spéculation propre à la procédure reste refusée pour tout vote.
    expect(codes("Le gouvernement devra le modifier ou le représenter.", opts)).toEqual(["SUITE"]);
  });

  it("ne rejette pas la description des mesures d'un texte entier (Codex P2)", () => {
    const opts = { scope: "WHOLE", hasProcedureFact: false } as const;
    expect(codes("Le texte propose de suspendre la hausse des loyers.", opts)).toEqual([]);
    expect(codes("Il prévoit de bloquer les prix de l'énergie jusqu'en 2028.", opts)).toEqual([]);
    expect(codes("Des négociations commerciales annuelles sont encadrées.", opts)).toEqual([]);
    expect(codes("La hausse est retardée d'un an pour les petites communes.", opts)).toEqual([]);
  });

  it("laisse passer le droit existant et les formes neutres ou négatives", () => {
    const opts = { scope: "OTHER", hasProcedureFact: false } as const;
    expect(codes("Les règles actuellement en vigueur restent identiques.", opts)).toEqual([]);
    expect(codes("Le texte doit être promulgué avant d'entrer en vigueur.", opts)).toEqual([]);
    expect(codes("La mesure rejetée n'entrera pas en vigueur.", opts)).toEqual([]);
    expect(codes("Le débat porte sur la date d'entrée en vigueur.", opts)).toEqual([]);
    expect(codes("Le taux de 20 % reste donc en vigueur.", opts)).toEqual([]);
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

  it("même avec une donnée officielle, une spéculation au-delà de cette donnée reste refusée", () => {
    // Sorti tel quel du dry-run du scrutin 9759, après ajout de la donnée de transmission.
    const text =
      "Le rejet de cette partie bloque pour l'instant l'adoption du budget 2027, qui doit encore être examiné par le Sénat.";
    expect(codes(text, { scope: "PART", hasProcedureFact: true })).toEqual(["SUITE"]);
  });

  it.each([
    "Ce rejet suspend temporairement l'adoption du budget 2027.",
    "Les règles pourraient évoluer selon les négociations entre l'Assemblée nationale et le Sénat.",
    "Cette partie conditionne le reste du texte.",
    "Les règles budgétaires restent en discussion.",
  ])("refuse la spéculation laissée passer par le dry-run : %s", (text) => {
    expect(codes(text, { scope: "PART", hasProcedureFact: true })).toEqual(["SUITE"]);
  });

  it("refuse les jugements que le dry-run du scrutin 9759 a laissé passer", () => {
    const opts = { scope: "PART", hasProcedureFact: true } as const;
    expect(codes("Cette partie est indispensable à l'examen du reste du texte.", opts)).toEqual([
      "JUGEMENT",
    ]);
    expect(codes("Ce texte est essentiel car il détermine les impôts.", opts)).toEqual([
      "JUGEMENT",
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
