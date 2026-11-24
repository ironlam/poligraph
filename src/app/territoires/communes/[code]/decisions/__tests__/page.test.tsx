import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CommuneDecisions, PublicDecision } from "@/lib/data/territoire-decisions";
import { dossier } from "../../__tests__/fixtures";

const mocks = vi.hoisted(() => ({
  getCommuneDecisions: vi.fn(),
  getCommuneDossier: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/lib/data/territoires", () => ({
  getCommuneDossier: (code: string) => mocks.getCommuneDossier(code),
}));
vi.mock("@/lib/data/territoire-decisions", () => ({
  getCommuneDecisions: (code: string) => mocks.getCommuneDecisions(code),
}));

import Page, { generateMetadata, generateStaticParams } from "../page";

function notice(overrides: Partial<PublicDecision> = {}): PublicDecision {
  return {
    id: "dec-1",
    title: "Création d'une ressourcerie communale",
    reference: "Délibération n° 2026-041",
    adoptionDate: new Date("2026-06-04T00:00:00.000Z"),
    adoptionDatePrecision: "DAY",
    publicationDate: new Date("2026-06-11T00:00:00.000Z"),
    effectiveDate: null,
    outcome: "ADOPTEE",
    outcomeWording: "adoptée à l'unanimité",
    reviewedAt: new Date("2026-10-02T10:00:00.000Z"),
    institution: { kind: "CONSEIL_MUNICIPAL", name: "Conseil municipal de Rennes" },
    source: {
      kind: "PROCES_VERBAL",
      title: "Procès-verbal du conseil municipal du 4 juin 2026",
      producer: "Commune de Rennes",
      url: "https://example.test/pv-2026-06-04.pdf",
      archiveUrl: null,
      lastVerifiedAt: new Date("2026-10-02T00:00:00.000Z"),
    },
    sourceLocator: "page 4, point 12",
    ...overrides,
  };
}

function data(overrides: Partial<CommuneDecisions> = {}): CommuneDecisions {
  return {
    commune: { inseeCode: "35238", name: "Rennes" },
    periods: {
      mayors: [
        {
          politicianId: "p-new",
          person: { fullName: "Camille Exemple", slug: "camille-exemple" },
          mandates: [{ mandateId: "m-new", start: "2026-03-22", end: null, decisions: [notice()] }],
          decisionCount: 1,
        },
      ],
      unestablished: [],
    },
    intercommunal: [],
    total: 1,
    truncated: false,
    ...overrides,
  };
}

async function render(value: CommuneDecisions | null) {
  mocks.getCommuneDecisions.mockResolvedValue(value);
  const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ code: "35238" }) }));
  const document = new DOMParser().parseFromString(html, "text/html");
  return { html, document, text: document.body.textContent?.replace(/\s+/g, " ") ?? "" };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCommuneDossier.mockResolvedValue(dossier());
});

describe("/territoires/communes/[code]/decisions", () => {
  it("n'existe pas tant qu'aucune décision n'est publiée", async () => {
    await expect(render(null)).rejects.toThrow("NEXT_NOT_FOUND");
    mocks.getCommuneDecisions.mockResolvedValue(null);
    const metadata = await generateMetadata({ params: Promise.resolve({ code: "35238" }) });
    expect(metadata.robots).toMatchObject({ index: false });
    expect(generateStaticParams()).toEqual([]);
  });

  it("hérite du verdict d'indexation de la commune et porte sa canonique", async () => {
    mocks.getCommuneDecisions.mockResolvedValue(data());
    const indexable = await generateMetadata({ params: Promise.resolve({ code: "35238" }) });
    expect(indexable.robots).toBeUndefined();
    expect(indexable.alternates?.canonical).toBe("/territoires/communes/rennes-35238/decisions");

    mocks.getCommuneDossier.mockResolvedValue({
      ...dossier(),
      population: { ...dossier().population, value: 120 },
    });
    const small = await generateMetadata({ params: Promise.resolve({ code: "35238" }) });
    expect(small.robots).toEqual({ index: false, follow: true });
  });

  it("présente la décision comme collective, le maire comme simple contexte daté", async () => {
    const { document, text } = await render(data());
    expect(document.querySelectorAll("h1")).toHaveLength(1);
    expect(text).toContain("Être en fonction à une date n'est pas avoir voté.");
    expect(text).toContain("Maire en fonction à cette date : Camille Exemple");
    expect(text).toContain("elle n'indique pas un vote personnel");
    expect(text).toContain("aucune position individuelle n'est attribuée");
    expect(text).toContain("Adoptée (« adoptée à l'unanimité »)");
    expect(text).toContain("page 4, point 12");
    expect(text).toContain("Document consulté le 2 octobre 2026");
  });

  it("ouvre la source dans un nouvel onglet, sans référent", async () => {
    const { document } = await render(data());
    const link = document.querySelector('a[href="https://example.test/pv-2026-06-04.pdf"]');
    expect(link?.getAttribute("target")).toBe("_blank");
    expect(link?.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("échappe un texte saisi au lieu de l'interpréter", async () => {
    const { html } = await render(
      data({
        periods: {
          mayors: [],
          unestablished: [notice({ title: "<img src=x onerror=alert(1)>" })],
        },
      })
    );
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x");
  });

  it("ne range jamais une décision intercommunale sous un maire", async () => {
    const epci = notice({
      id: "dec-epci",
      title: "Schéma des mobilités",
      institution: { kind: "CONSEIL_COMMUNAUTAIRE", name: "Conseil de Rennes Métropole" },
    });
    const { document } = await render(data({ intercommunal: [epci] }));
    const card = document.getElementById("decision-dec-epci")!;
    expect(card.closest("#intercommunales, section")?.textContent).toContain(
      "Décisions intercommunales concernant la commune"
    );
    expect(card.textContent).not.toContain("Maire en fonction");
  });

  it("signale la période non établie sans nommer personne", async () => {
    const { text } = await render(
      data({ periods: { mayors: [], unestablished: [notice({ adoptionDatePrecision: "MONTH" })] } })
    );
    expect(text).toContain("Période institutionnelle non établie");
    expect(text).toContain("juin 2026");
    expect(text).not.toContain("Maire en fonction");
  });
});
