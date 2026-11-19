import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { dossier } from "../../__tests__/fixtures";

vi.mock("server-only", () => ({}));

import fs from "node:fs";
import path from "node:path";
import { CommuneElectionsSections } from "@/components/territoires/CommuneElectionsPage";
import type { CommuneElections } from "@/lib/data/territoire-elections";
import { communeScrutins } from "@/lib/territoires/commune-elections";

function render() {
  const d = dossier();
  // The fixture only carries municipal ballots: one is repeated as a presidential one so the
  // page has two types to link to.
  const municipales = communeScrutins(d.elections, d.identity.inseeCode);
  const scrutins = [
    ...municipales,
    { ...municipales[0]!, slug: "presidentielle-test", type: "PRESIDENTIELLE" as const },
  ];
  const data: CommuneElections = {
    commune: { inseeCode: d.identity.inseeCode, name: d.identity.name },
    scrutins,
    indexSignals: { population: d.population.value, maireEtabli: true },
  };
  const html = renderToStaticMarkup(<CommuneElectionsSections data={data} />);
  const document = new DOMParser().parseFromString(html, "text/html");
  return { document, text: document.body.textContent?.replace(/\s+/g, " ").trim() ?? "" };
}

describe("page dédiée des élections de la commune", () => {
  it("ouvre le scrutin le plus récent et montre tous les types sur une seule page", () => {
    const { document } = render();
    expect(document.querySelector("details")?.hasAttribute("open")).toBe(true);
    expect(document.querySelectorAll("section[aria-labelledby^='type-']").length).toBeGreaterThan(
      1
    );
  });

  // Régression (2026-11-19) : le filtre `?type=` rendait la page impossible à mettre en cache,
  // chaque visite relançait un rendu. Les types sont des ancres de la même page.
  it("mène à chaque type par une ancre, jamais par un paramètre d'adresse", () => {
    const { document } = render();
    const links = [
      ...document.querySelectorAll('nav[aria-label="Aller à un type de scrutin"] a'),
    ].map((a) => a.getAttribute("href")!);
    expect(links.length).toBeGreaterThan(1);
    for (const href of links) {
      expect(href).toMatch(/^#type-/);
      expect(document.getElementById(href.slice(1))).not.toBeNull();
    }
    expect(document.querySelector('a[href*="?type="]')).toBeNull();
    expect(document.querySelector("script")).toBeNull();
  });

  it("ne lit pas la chaîne de requête, pour rester en cache", () => {
    const source = fs
      .readFileSync(path.resolve(__dirname, "../page.tsx"), "utf8")
      .replace(/\/\/.*$/gm, "");
    expect(source).not.toContain("searchParams");
    expect(source).toContain("generateStaticParams");
  });

  it("demande aux robots de ne pas suivre le lien vers les données JSON", () => {
    const { document } = render();
    const link = document.querySelector('a[href^="/api/v1/territoires/communes/"]');
    expect(link?.getAttribute("rel")).toBe("nofollow");
  });

  it("n'affiche jamais zéro pour un scrutin non importé", () => {
    const { text } = render();
    expect(text).toContain("non établis, jamais comptés comme zéro");
    expect(text).not.toMatch(/\b0 voix/);
  });
});
