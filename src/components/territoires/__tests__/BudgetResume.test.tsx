import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The reader module opens the database at import; this test only renders.
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("next/cache", () => ({ cacheTag: vi.fn(), cacheLife: vi.fn() }));
import { BudgetResume } from "@/components/territoires/BudgetResume";
import { groupComptes } from "@/lib/data/territoire-comptes";
import type { RepereRow } from "@/lib/data/territoire-reperes";

const SOURCE = {
  producer: "Observatoire des finances et de la gestion publique locales (OFGL)",
  resourceUrl: "https://data.ofgl.fr/explore/dataset/ofgl-base-communes-consolidee/",
  licenceName: "Licence Ouverte / Open Licence version 2.0 (Etalab)",
  licenceUrl: "https://www.etalab.gouv.fr/licence-ouverte-open-licence",
  attribution: "« Calcul OFGL, source DGFiP »",
  methodSlug: null,
  importedAt: "2026-11-22T08:00:00.000Z",
};

const row = (key: string, value: number | null, over: Partial<RepereRow> = {}): RepereRow => ({
  indicatorKey: `comptes_${key}`,
  periodStart: "2024-01-01",
  periodEnd: "2024-12-31",
  scopeKind: "COMMUNE",
  scopeId: "212900195",
  scopeLabel: null,
  value,
  unit: key.endsWith("par_habitant") ? "€/hab" : "€",
  sampleSize: null,
  state: value === null ? "NON_ETABLI" : "ETABLI",
  reason: null,
  source: SOURCE,
  ...over,
});

// Brest, 2024, values of the OFGL.
const BREST = groupComptes([
  row("depenses_fonctionnement_par_habitant", 934.29),
  row("depenses_fonctionnement_montant", 132888085.6),
  row("frais_personnel_par_habitant", 406.89),
  row("frais_personnel_montant", 57873508.68),
  row("depenses_equipement_par_habitant", 135.71),
  row("depenses_equipement_montant", 19302096.09),
  row("encours_dette_par_habitant", 135.68),
  row("encours_dette_montant", 19298274.94),
  row("epargne_brute_par_habitant", 117.26),
  row("epargne_brute_montant", 16677933.51),
]);

// Plain text of the markup: tags out, apostrophes decoded, no-break spaces kept.
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/[ \t\n]+/g, " ")
    .trim();

describe("BudgetResume", () => {
  const html = renderToStaticMarkup(
    <BudgetResume
      comptes={BREST}
      scale="COM"
      budgetHref="/territoires/communes/brest-29019/budget"
    />
  );

  it("répond d'abord par la phrase du gabarit, sous sa propre ancre", () => {
    expect(html).toContain('id="comptes"');
    expect(text(html)).toContain(
      "Les comptes de la collectivité Méthode En 2024, la commune a dépensé 934 € par habitant pour son fonctionnement, soit 132,9 millions d'euros au total."
    );
  });

  it("met les trois dépenses en barres sur une échelle, la dette et l'épargne en lignes", () => {
    const widths = [...html.matchAll(/style="width:(\d+)%"/g)].map((m) => Number(m[1]));
    expect(widths).toEqual([100, 44, 15]);
    expect(text(html)).toContain("Encours de dette au 31 décembre 2024 136 € par habitant");
    expect(text(html)).toContain(
      "Épargne brute 2024 117 € par habitant 16,7 millions d'euros au total"
    );
  });

  it("porte une ligne de source avec l'exercice, l'attribution et la licence", () => {
    expect(text(html)).toContain(
      "Comptes 2024 · Source : Calcul OFGL, source DGFiP (nouvel onglet) · Licence Ouverte / Open Licence version 2.0 (Etalab), données lues le 22 novembre 2026"
    );
  });

  it("mène à la série année par année et à la méthode du chiffre de la phrase", () => {
    expect(html).toContain('href="/territoires/communes/brest-29019/budget"');
    expect(text(html)).toContain("Les comptes année par année, depuis 2018");
    expect(html).toContain('href="/territoires/methode/depenses-de-fonctionnement"');
  });

  it("dit le motif d'une collectivité unique au lieu d'un chiffre", () => {
    const absent = (key: string) => row(key, null, { reason: "COLLECTIVITE_UNIQUE", scopeId: "" });
    const corse = groupComptes(
      [
        "depenses_fonctionnement",
        "frais_personnel",
        "depenses_equipement",
        "encours_dette",
        "epargne_brute",
      ].flatMap((k) => [absent(`${k}_par_habitant`), absent(`${k}_montant`)])
    );
    const out = text(
      renderToStaticMarkup(
        <BudgetResume
          comptes={corse}
          scale="DEP"
          budgetHref="/territoires/departements/corse-du-sud/budget"
        />
      )
    );
    expect(out).toContain("une collectivité unique en exerce les compétences");
    expect(out).not.toMatch(/\b0 €/);
    expect(out).not.toContain("Dépenses 2024");
  });

  it("rappelle sous les chiffres que l'intercommunalité tient ses propres comptes", () => {
    const sans = text(html);
    expect(sans).not.toContain("commune seule");
    const out = text(
      renderToStaticMarkup(
        <BudgetResume
          comptes={BREST}
          scale="COM"
          budgetHref="/territoires/communes/brest-29019/budget"
          intercommunalites={["Brest Métropole"]}
        />
      )
    );
    expect(out).toContain(
      "16,7 millions d'euros au total Ces comptes sont ceux de la commune seule. Brest Métropole tient ses propres comptes, qui ne figurent pas ici. Les comptes année par année"
    );
  });

  it("ne porte cette ligne qu'à l'échelle de la commune", () => {
    const out = renderToStaticMarkup(
      <BudgetResume
        comptes={BREST}
        scale="DEP"
        budgetHref="/territoires/departements/finistere/budget"
        intercommunalites={["Brest Métropole"]}
      />
    );
    expect(text(out)).not.toContain("commune seule");
  });

  it("replie le détail des chiffres et laisse visibles la phrase, le lien et la source", () => {
    const repli = html.slice(html.indexOf("<details"), html.indexOf("</details>"));
    expect(html).not.toContain("<details open");
    expect(text(repli)).toContain("Le détail 2024 : dépenses, dette, épargne");
    expect(text(repli)).toContain("Encours de dette au 31 décembre 2024");
    expect(repli).toContain('style="width:100%"');
    const apres = html.slice(html.indexOf("</details>"));
    expect(html.indexOf("En 2024, la commune a dépensé")).toBeLessThan(html.indexOf("<details"));
    expect(apres).toContain('href="/territoires/communes/brest-29019/budget"');
    expect(text(apres)).toContain("Comptes 2024 · Source");
  });

  it("ne rend rien tant que rien n'est publié", () => {
    expect(
      renderToStaticMarkup(
        <BudgetResume
          comptes={groupComptes([])}
          scale="REG"
          budgetHref="/territoires/regions/bretagne/budget"
        />
      )
    ).toBe("");
  });

  it("ne lit ni élu, ni parti, ni autre territoire", () => {
    for (const f of [
      "src/components/territoires/BudgetResume.tsx",
      "src/components/territoires/MesureBarre.tsx",
      "src/lib/territoires/comptes-phrase.ts",
      "src/lib/data/territoire-comptes.ts",
    ]) {
      const code = readFileSync(join(process.cwd(), f), "utf8").replace(
        /\/\*[\s\S]*?\*\/|\/\/.*$/gm,
        ""
      );
      expect(code, f).not.toMatch(
        /politician|mandate|"Party"|\bmaire\b|classement|\brang\b|moyenne/i
      );
    }
  });
});
