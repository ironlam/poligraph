import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { dossier } from "../../__tests__/fixtures";

vi.mock("server-only", () => ({}));

import {
  CommuneElectionsSections,
  scrutinTypeFromParam,
} from "@/components/territoires/CommuneElectionsPage";
import type { CommuneElections } from "@/lib/data/territoire-elections";
import { communeScrutins } from "@/lib/territoires/commune-elections";

function render(active: Parameters<typeof CommuneElectionsSections>[0]["active"] = null) {
  const d = dossier();
  const data: CommuneElections = {
    commune: { inseeCode: d.identity.inseeCode, name: d.identity.name },
    scrutins: communeScrutins(d.elections, d.identity.inseeCode),
    indexSignals: { population: d.population.value, maireEtabli: true },
  };
  const html = renderToStaticMarkup(<CommuneElectionsSections data={data} active={active} />);
  const document = new DOMParser().parseFromString(html, "text/html");
  return { document, text: document.body.textContent?.replace(/\s+/g, " ").trim() ?? "" };
}

describe("page dédiée des élections de la commune", () => {
  it("ouvre le scrutin le plus récent et marque le filtre actif", () => {
    const { document } = render();
    expect(document.querySelector("details")?.hasAttribute("open")).toBe(true);
    const current = document.querySelector(
      'nav[aria-label="Filtrer par type de scrutin"] [aria-current]'
    );
    expect(current?.textContent).toContain("Tous");
  });

  it("filtre par lien, sans état client", () => {
    const { document } = render("MUNICIPALES");
    const link = document.querySelector('a[href$="/elections?type=municipales"]');
    expect(link?.getAttribute("aria-current")).toBe("page");
    expect(document.querySelector("script")).toBeNull();
  });

  it("n'affiche jamais zéro pour un scrutin non importé", () => {
    const { text } = render();
    expect(text).toContain("non établis, jamais comptés comme zéro");
    expect(text).not.toMatch(/\b0 voix/);
  });

  it("ignore une valeur de filtre inconnue", () => {
    expect(scrutinTypeFromParam("legislatives")).toBeNull();
    expect(scrutinTypeFromParam("presidentielle")).toBe("PRESIDENTIELLE");
  });
});
