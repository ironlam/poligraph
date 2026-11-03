import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/donation/SupportPageDonation", () => ({
  SupportPageDonation: () => null,
}));

import SoutenirPage from "./page";

describe("page soutenir : HelloAsso et Tipeee", () => {
  const html = renderToStaticMarkup(<SoutenirPage />);

  it("ne dit plus que HelloAsso est le canal principal", () => {
    expect(html).not.toMatch(/canal principal/i);
  });

  it("dit que HelloAsso va à l'association Sankofa", () => {
    expect(html).toMatch(/HelloAsso[^<]*association Sankofa/);
  });

  it("dit que Tipeee finance le projet Poligraph, hébergement et nouveaux projets", () => {
    expect(html).toMatch(/Tipeee[^<]*projet Poligraph/);
    expect(html).toMatch(/hébergement/i);
  });

  it("garde le lien vers la page Tipeee", () => {
    expect(html).toContain('href="https://fr.tipeee.com/poligraph"');
  });
});
