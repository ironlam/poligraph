import { describe, expect, it } from "vitest";
import {
  sampleCounts,
  addAnalysis,
  buildEauRows,
  classifyAnalysis,
  eauWindow,
  inWindow,
  parseLimit,
  type UdiCount,
} from "@/lib/territoires/eau-nitrates";

describe("limite de qualité", () => {
  it("lit la limite telle que la source l'écrit", () => {
    expect(parseLimit("<=50 mg/L")).toBe(50);
    expect(parseLimit(" <= 0,1 mg/L ")).toBe(0.1);
    expect(parseLimit("")).toBeNull();
    expect(parseLimit("50 µg/L")).toBeNull();
  });
});

describe("classement d'une analyse", () => {
  it("lit le texte brut, virgule décimale comprise", () => {
    expect(classifyAnalysis("14", 50)).toBe("SOUS_LA_LIMITE");
    expect(classifyAnalysis("3,2", 50)).toBe("SOUS_LA_LIMITE");
    expect(classifyAnalysis("50", 50)).toBe("SOUS_LA_LIMITE");
    expect(classifyAnalysis("50,1", 50)).toBe("AU_DESSUS");
    expect(classifyAnalysis("63", 50)).toBe("AU_DESSUS");
  });

  it("compte « inférieur à » sous la limite, sans lire la valeur comme une mesure", () => {
    expect(classifyAnalysis("<1", 50)).toBe("SOUS_LA_LIMITE");
    expect(classifyAnalysis("<50", 50)).toBe("SOUS_LA_LIMITE");
  });

  it("ne tranche pas ce qui ne peut pas l'être", () => {
    expect(classifyAnalysis("<60", 50)).toBe("INDETERMINE");
    expect(classifyAnalysis(">10", 50)).toBe("INDETERMINE");
    expect(classifyAnalysis("", 50)).toBe("INDETERMINE");
    expect(classifyAnalysis("absence", 50)).toBe("INDETERMINE");
    expect(classifyAnalysis(">60", 50)).toBe("AU_DESSUS");
  });
});

describe("fenêtre de douze mois", () => {
  it("se termine à la dernière date de la source, pas à aujourd'hui", () => {
    expect(eauWindow("2026-08-31")).toEqual({ start: "2025-09-01", end: "2026-08-31" });
    expect(eauWindow("2026-08-28")).toEqual({ start: "2025-08-29", end: "2026-08-28" });
  });

  it("borne les deux jours inclus", () => {
    const w = eauWindow("2026-08-31");
    expect(inWindow("2025-09-01", w)).toBe(true);
    expect(inWindow("2026-08-31", w)).toBe(true);
    expect(inWindow("2025-08-31", w)).toBe(false);
    expect(inWindow("2026-09-01", w)).toBe(false);
  });
});

describe("lignes par unité de distribution", () => {
  const counts = (entries: [string, Partial<UdiCount>][]) =>
    new Map(entries.map(([k, v]) => [k, { analyses: 0, above: 0, indeterminate: 0, ...v }]));
  const known = new Set(["35238", "35001"]);

  it("établit une unité à partir de 4 analyses, avec le nombre au-dessus de la limite", () => {
    const rows = buildEauRows(
      [{ commune: "35238", udi: "U1", udiLabel: "Rennes" }],
      counts([["U1", { analyses: 12, above: 0 }]]),
      known
    );
    expect(rows).toEqual([
      expect.objectContaining({ state: "ETABLI", value: 0, sampleSize: 12, reason: null }),
    ]);
  });

  it("n'établit rien sous 4 analyses et garde le compte, jamais un zéro", () => {
    const rows = buildEauRows(
      [{ commune: "35238", udi: "U1", udiLabel: "Rennes" }],
      counts([["U1", { analyses: 3, above: 0 }]]),
      known
    );
    expect(rows[0]).toMatchObject({
      state: "NON_ETABLI",
      value: null,
      sampleSize: 3,
      reason: "SEUIL_ANALYSES",
    });
  });

  it("traite une unité sans aucune analyse comme non établie, avec zéro analyse", () => {
    const rows = buildEauRows([{ commune: "35238", udi: "U9", udiLabel: "X" }], new Map(), known);
    expect(rows[0]).toMatchObject({ state: "NON_ETABLI", value: null, sampleSize: 0 });
  });

  it("ne fait aucune moyenne : une commune servie par deux unités a deux lignes", () => {
    const rows = buildEauRows(
      [
        { commune: "35238", udi: "U1", udiLabel: "A" },
        { commune: "35238", udi: "U2", udiLabel: "B" },
      ],
      counts([
        ["U1", { analyses: 10, above: 0 }],
        ["U2", { analyses: 5, above: 2 }],
      ]),
      known
    );
    expect(rows.map((r) => [r.scopeId, r.value])).toEqual([
      ["U1", 0],
      ["U2", 2],
    ]);
  });

  it("dédouble les quartiers d'une même unité et ignore les communes inconnues", () => {
    const rows = buildEauRows(
      [
        { commune: "35238", udi: "U1", udiLabel: "A" },
        { commune: "35238", udi: "U1", udiLabel: "A" },
        { commune: "99999", udi: "U1", udiLabel: "A" },
      ],
      counts([["U1", { analyses: 10 }]]),
      known
    );
    expect(rows).toHaveLength(1);
  });

  it("ne compte pas un résultat indéterminé parmi les analyses", () => {
    const c = new Map<string, UdiCount>();
    addAnalysis(c, "U1", "SOUS_LA_LIMITE");
    addAnalysis(c, "U1", "INDETERMINE");
    addAnalysis(c, "U1", "AU_DESSUS");
    expect(c.get("U1")).toEqual({ analyses: 2, above: 1, indeterminate: 1 });
  });
});

describe("prélèvements retenus pour une unité", () => {
  const sur = { cdreseauamont: "", pourcentdebit: "" };
  const amont = (p: string) => ({ cdreseauamont: "U0", pourcentdebit: p });

  it("garde par défaut les prélèvements de l'unité et d'une installation qui l'alimente", () => {
    expect(sampleCounts("SANS_PART_NULLE", sur)).toBe(true);
    expect(sampleCounts("SANS_PART_NULLE", amont("100 %"))).toBe(true);
    expect(sampleCounts("SANS_PART_NULLE", amont("30 %"))).toBe(true);
    expect(sampleCounts("SANS_PART_NULLE", amont(""))).toBe(true);
  });

  it("écarte une installation amont qui fournit 0 % de l'unité", () => {
    expect(sampleCounts("SANS_PART_NULLE", amont("0 %"))).toBe(false);
    expect(sampleCounts("SANS_PART_NULLE", amont("0"))).toBe(false);
    expect(sampleCounts("SANS_PART_NULLE", amont("10 %"))).toBe(true);
  });

  it("propose les deux autres lectures", () => {
    expect(sampleCounts("TOUS", amont("0 %"))).toBe(true);
    expect(sampleCounts("SUR_UNITE", amont("100 %"))).toBe(false);
    expect(sampleCounts("SUR_UNITE", sur)).toBe(true);
  });
});
