import { describe, expect, it, vi } from "vitest";
import { AN_LEGISLATURE_COVERAGE } from "@/config/legislatures";
import { render, screen, within } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  usePathname: () => "/parlement/assemblee/legislatures",
}));
vi.mock("@/components/seo/JsonLd", () => ({
  BreadcrumbJsonLd: () => null,
  CollectionPageJsonLd: () => null,
}));

import LegislaturesPage, { metadata as listMetadata } from "../page";
import LegislaturePage, { generateMetadata, generateStaticParams } from "../[n]/page";

const params = (n: string) => ({ params: Promise.resolve({ n }) });

describe("/parlement/assemblee/legislatures", () => {
  it("liste les trois législatures avec la 15e et un état honnête", () => {
    render(<LegislaturesPage />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Les législatures de l'Assemblée nationale"
    );
    const frise = screen.getByRole("list", { name: "Frise des législatures" });
    expect(within(frise).getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByText(/Ce n'est pas une assemblée vide/)).toBeInTheDocument();
    expect(screen.getByText("Avant la 15e législature")).toBeInTheDocument();
  });

  it("est indexable avec un canonical", () => {
    expect(listMetadata.alternates?.canonical).toBe("/parlement/assemblee/legislatures");
    expect(listMetadata.robots).toBeUndefined();
  });
});

describe("/parlement/assemblee/legislatures/[n]", () => {
  it("ne génère que les législatures configurées", () => {
    expect(generateStaticParams()).toEqual([{ n: "15" }, { n: "16" }, { n: "17" }]);
  });

  it.each(["14", "18", "0", "abc", "16.5", "016", "-1", "16e", "1e2", ""])(
    "répond 404 pour le paramètre %j",
    async (n) => {
      await expect(LegislaturePage(params(n))).rejects.toThrow("NOT_FOUND");
      const meta = await generateMetadata(params(n));
      expect(meta.robots).toEqual({ index: false, follow: false });
    }
  );

  it("16e : dates distinctes, sans début de mandat, sans positions de groupe", async () => {
    render(await LegislaturePage(params("16")));

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "16e législature de l'Assemblée nationale"
    );
    expect(screen.getByText("Signature du décret de dissolution")).toBeInTheDocument();
    expect(screen.getByText("Entrée en vigueur de la dissolution")).toBeInTheDocument();
    expect(screen.getByText("Fin indiquée par les archives de l'Assemblée")).toBeInTheDocument();
    expect(screen.queryByText("Début d'un mandat de député")).not.toBeInTheDocument();
    expect(screen.getByText(/ne sont pas interchangeables/)).toBeInTheDocument();
    expect(
      screen.getByText("Ce n'est pas la composition actuelle.", { exact: false })
    ).toBeInTheDocument();
    const table = screen.getByRole("table");
    expect(within(table).getByText("Positions de groupe calculées")).toBeInTheDocument();
    expect(within(table).getAllByText("Non publié").length).toBeGreaterThan(0);
  });

  it("15e : jeux absents nommés, aucun lien vers des scrutins, noindex", async () => {
    render(await LegislaturePage(params("15")));

    expect(screen.getByText("Scrutins non importés")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Scrutins de la 15e législature/ })).toBeNull();
    expect(
      screen.getByText(/Ce n'est pas une absence d'activité parlementaire/)
    ).toBeInTheDocument();
    expect(screen.getByText(/Les archives de l'Assemblée datent le début/)).toBeInTheDocument();
    const meta = await generateMetadata(params("15"));
    expect(meta.robots).toEqual({ index: false, follow: true });
  });

  it("17e : échéance conditionnelle, lien vers les scrutins, indexable", async () => {
    render(await LegislaturePage(params("17")));

    expect(screen.getByText(/ne vaut qu'en l'absence de dissolution/)).toBeInTheDocument();
    expect(screen.getByText("Première séance de la législature")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Scrutins de la 17e législature/ })).toHaveAttribute(
      "href",
      "/parlement/votes?legislature=17"
    );
    const meta = await generateMetadata(params("17"));
    expect(meta.robots).toBeUndefined();
    expect(meta.alternates?.canonical).toBe("/parlement/assemblee/legislatures/17");
  });

  it("n'affiche aucun niveau global de complétude ni le mot « complet » en statut", async () => {
    for (const n of ["15", "16", "17"]) {
      const { unmount } = render(await LegislaturePage(params(n)));
      expect(screen.queryByText(/législature complète/i)).toBeNull();
      expect(document.querySelector('[data-status="complete"]')).toBeNull();
      unmount();
    }
  });

  it("17e : première séance sourcée, sans « a commencé depuis »", async () => {
    render(await LegislaturePage(params("17")));
    expect(
      screen.getByText(/est en cours\. Sa première séance a eu lieu le 18 juillet 2024\./)
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/a commencé depuis/);
  });

  it.each(["15", "16", "17"])(
    "%s : le tableau n'affiche pas le périmètre interne et date les mesures de PoliGraph",
    async (n) => {
      render(await LegislaturePage(params(n)));
      const coverage = AN_LEGISLATURE_COVERAGE.find((c) => c.number === Number(n))!;
      const table = screen.getByRole("table");
      for (const ds of coverage.datasets) {
        expect(ds.perimeter.length).toBeGreaterThan(0);
        expect(table.textContent).not.toContain(ds.perimeter);
        expect(table.textContent).not.toMatch(/-leg1\d|importé\(s\) toutes origines|externalId/);
      }
      expect(within(table).getAllByText("15 octobre 2026")).toHaveLength(coverage.datasets.length);
      expect(
        screen.getByText(/comptages faits par PoliGraph sur ses propres données/)
      ).toBeInTheDocument();
      expect(
        screen.getByText(/aucune statistique officielle de l'Assemblée nationale/)
      ).toBeInTheDocument();
    }
  );
});
