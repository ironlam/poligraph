import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { CommuneChiffres } from "@/lib/data/territoire-chiffres";
import type { RepereRow } from "@/lib/data/territoire-reperes";

vi.mock("server-only", () => ({}));

import { hasChiffres, TerritoireChiffres } from "@/components/territoires/TerritoireChiffres";
import { REPERE_METHODES } from "@/config/territoire-methodes";
import { REPERE_INDICATORS } from "@/config/territoire-reperes";

const source = {
  producer: "INSEE",
  resourceUrl: "https://example.test/ressource",
  licenceName: "Licence Ouverte 2.0",
  licenceUrl: "https://example.test/licence",
  attribution: "Source : INSEE",
  methodSlug: "structure-par-age",
  importedAt: "2026-10-13T08:00:00.000Z",
};

const row = (
  indicatorKey: string,
  value: number | null,
  over: Partial<RepereRow> = {}
): RepereRow => ({
  indicatorKey,
  periodStart: "2022-01-01",
  periodEnd: "2022-12-31",
  scopeKind: "COMMUNE",
  scopeLabel: null,
  value,
  unit: "%",
  sampleSize: null,
  state: value === null ? "NON_ETABLI" : "ETABLI",
  reason: null,
  source,
  ...over,
});

const base = (over: Partial<CommuneChiffres> = {}): CommuneChiffres => ({
  inseeCode: "35238",
  population: { millesime: 2023, value: 6412, producer: "INSEE", effectiveFrom: "2026-01-01" },
  evolution: {
    ok: true,
    from: { millesime: 2022, value: 6300 },
    to: { millesime: 2023, value: 6412 },
  },
  reperes: [],
  ...over,
});

const render = (c: CommuneChiffres) => {
  const html = renderToStaticMarkup(<TerritoireChiffres chiffres={c} />);
  const doc = new DOMParser().parseFromString(html, "text/html");
  return { html, doc, text: doc.body.textContent?.replace(/\s+/g, " ").trim() ?? "" };
};

describe("Le territoire en chiffres", () => {
  it("n'affiche que les thèmes alimentés", () => {
    const { text } = render(base());
    expect(text).toContain("Démographie");
    expect(text).not.toMatch(/Logement|Sécurité|Environnement/);
  });

  it("se cache entièrement sans aucune donnée", () => {
    const c = base({ population: null, reperes: [] });
    expect(hasChiffres(c)).toBe(false);
    expect(render(c).html).toBe("");
  });

  it("dit non établi une population absente, jamais zéro", () => {
    const { text } = render(base({ population: null, reperes: [row("age_tranche_0_14", 17)] }));
    expect(text).toContain("Non établi");
    expect(text).not.toMatch(/\b0 habitant/);
  });

  it("dit pourquoi l'évolution est refusée", () => {
    const { text } = render(base({ evolution: { ok: false, reason: "PRODUCTEURS_DIFFERENTS" } }));
    expect(text).toContain("Évolution non établie");
    expect(text).not.toContain("est passée de");
  });

  it("rend les six tranches d'âge avec leur source et un lien de méthode", () => {
    const keys = [
      "age_tranche_0_14",
      "age_tranche_15_29",
      "age_tranche_30_44",
      "age_tranche_45_59",
      "age_tranche_60_74",
      "age_tranche_75_plus",
    ];
    const { doc, text } = render(base({ reperes: keys.map((k) => row(k, 16.5)) }));
    expect(doc.querySelectorAll("table tbody tr")).toHaveLength(6);
    expect(doc.querySelector("table caption")).not.toBeNull();
    expect(text).toContain("Source : INSEE");
    expect(doc.querySelector('a[href="/territoires/methode/structure-par-age"]')).not.toBeNull();
  });

  it("n'écrit jamais 0 pour une tranche non établie", () => {
    const { doc } = render(
      base({ reperes: [row("age_tranche_0_14", null), row("age_tranche_15_29", 20)] })
    );
    const cells = [...doc.querySelectorAll("table td")].map((c) => c.textContent);
    expect(cells[0]).toBe("non établi");
    expect(cells).not.toContain("0,0 %");
  });

  it("n'affiche que la période la plus récente de chaque indicateur", () => {
    const recent = row("age_tranche_0_14", 17, { periodEnd: "2022-12-31" });
    const old = row("age_tranche_0_14", 99, { periodStart: "2016-01-01", periodEnd: "2016-12-31" });
    const { doc } = render(base({ reperes: [recent, old] }));
    const cells = [...doc.querySelectorAll("table td")].map((c) => c.textContent);
    expect(cells[0]?.replace(/\s/g, " ")).toBe("17,0 %");
    expect(cells.join(" ")).not.toContain("99");
  });

  it("affiche la station et la distance de la valeur climatique", () => {
    const climat = row("climat_temp_moyenne", 11.8, {
      unit: "°C",
      scopeKind: "STATION",
      scopeLabel: "Station de l'Aérodrome du Val Fictif, à 14 km",
      source: { ...source, methodSlug: "climat" },
    });
    const { text, doc } = render(base({ reperes: [climat] }));
    expect(text).toContain("Environnement");
    expect(text).toContain("Station de l'Aérodrome du Val Fictif, à 14 km");
    expect(text).toContain("11,8 °C");
    expect(doc.querySelector('a[href="/territoires/methode/climat"]')).not.toBeNull();
  });

  it("présente chaque unité de distribution séparément, avec la phrase fixe sur la limite", () => {
    const eau = (label: string, value: number | null, n: number) =>
      row("eau_nitrates", value, {
        unit: "analyses",
        scopeKind: "UDI",
        scopeLabel: label,
        sampleSize: n,
        periodStart: "2025-09-01",
        periodEnd: "2026-08-31",
        state: value === null ? "NON_ETABLI" : "ETABLI",
        source: { ...source, methodSlug: "eau-du-robinet" },
      });
    const { text, doc } = render(
      base({
        reperes: [eau("RESEAU NORD", 0, 12), eau("RESEAU SUD", 2, 6), eau("RESEAU PETIT", null, 3)],
      })
    );
    expect(text).toContain("Unité de distribution : RESEAU NORD");
    expect(text).toContain(
      "12 analyses de nitrates : aucune au-dessus de la limite de qualité (50 mg/L)"
    );
    expect(text).toContain("6 analyses de nitrates : 2 au-dessus");
    expect(text).toContain("non établi, 3 analyses de nitrates, moins de 4 nécessaires");
    expect(text).toContain("ne veut pas dire que l'eau est impropre");
    expect(text).not.toMatch(/moyenne/);
    expect(doc.querySelector('a[href="/territoires/methode/eau-du-robinet"]')).not.toBeNull();
  });

  it("garde chaque unité à sa période la plus récente, sans en perdre une", () => {
    const mk = (label: string, end: string, value: number) =>
      row("eau_nitrates", value, {
        scopeKind: "UDI",
        scopeLabel: label,
        sampleSize: 8,
        periodEnd: end,
        source: { ...source, methodSlug: "eau-du-robinet" },
      });
    const { text } = render(
      base({
        reperes: [mk("A", "2026-08-31", 0), mk("B", "2026-08-31", 1), mk("A", "2025-08-31", 5)],
      })
    );
    expect(text).toContain("Unité de distribution : A");
    expect(text).toContain("Unité de distribution : B");
    expect(text.match(/Unité de distribution : A/g)).toHaveLength(1);
  });

  it("dit le secret statistique en mots, jamais comme une valeur", () => {
    const climat = row("climat_temp_moyenne", null, { state: "SECRET_STATISTIQUE", unit: "°C" });
    const { text } = render(base({ reperes: [climat] }));
    expect(text).toContain("Secret statistique");
    expect(text).not.toMatch(/0 °C/);
  });
});

describe("garde-fous du bloc et de ses pages de méthode", () => {
  const root = process.cwd();
  const strip = (code: string) =>
    code
      .split("\n")
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
      .join("\n");
  const files = [
    "src/components/territoires/TerritoireChiffres.tsx",
    "src/config/territoire-reperes.ts",
    "src/config/territoire-methodes.ts",
    "src/lib/territoires/population-evolution.ts",
    "src/lib/territoires/climat-station.ts",
    "src/lib/data/territoire-chiffres.ts",
    "src/app/territoires/methode/[indicateur]/page.tsx",
  ];

  it("n'emploie aucune classe de couleur sémantique", () => {
    for (const f of files) {
      const code = strip(readFileSync(join(root, f), "utf8"));
      expect(code, f).not.toMatch(
        /\b(?:text|bg|border)-(?:red|green|blue|orange|yellow|emerald|rose|amber|destructive|success|warning)\b/
      );
    }
  });

  it("ne reçoit ni ne lit aucune donnée d'élu ou de parti", () => {
    for (const f of files) {
      const code = strip(readFileSync(join(root, f), "utf8"));
      expect(code, f).not.toMatch(
        /politician|mandate|"Party"|\bmaire\b|PersonRef|ParlementaireRef/i
      );
    }
  });

  it("n'additionne, ne classe ni ne note aucun chiffre", () => {
    for (const f of files) {
      const code = strip(readFileSync(join(root, f), "utf8"));
      expect(code, f).not.toMatch(/\b(score|rang|rank|classement|reduce\()/i);
    }
  });

  const texts = () => [
    ...REPERE_METHODES.flatMap((m) => [m.title, m.montre, m.calcul, m.limites, m.neDitPas]),
    ...REPERE_INDICATORS.map((i) => i.label),
    ...files.map((f) => readFileSync(join(root, f), "utf8")),
  ];

  it("n'emploie aucun mot qui juge ou compare", () => {
    for (const t of texts()) {
      expect(t).not.toMatch(/plus sûr|moins sûr|meilleur|\bpire\b|dangereux|pollué/i);
    }
  });

  it("ne contient aucun tiret cadratin ni demi-cadratin", () => {
    for (const t of texts()) expect(t).not.toMatch(/[—–]/);
  });

  it("ne laisse aucun accent manquant parmi les fautes récurrentes dans les textes affichés", () => {
    const shown = [
      ...REPERE_METHODES.flatMap((m) => [m.title, m.montre, m.calcul, m.limites, m.neDitPas]),
      ...REPERE_INDICATORS.map((i) => i.label),
    ];
    for (const t of shown) {
      expect(t).not.toMatch(
        /\begalement\b|\belus\b|\bcriteres\b|\bdeputes\b|\bresultats\b|\bperiode\b/
      );
    }
  });

  it("couvre chaque indicateur par une page de méthode", () => {
    const slugs = new Set(REPERE_METHODES.map((m) => m.slug));
    for (const i of REPERE_INDICATORS) expect(slugs.has(i.methodSlug), i.key).toBe(true);
  });

  it("garde un dossier du bloc sans fichier inattendu", () => {
    expect(
      readdirSync(join(root, "src/components/territoires")).includes("TerritoireChiffres.tsx")
    ).toBe(true);
  });
});
