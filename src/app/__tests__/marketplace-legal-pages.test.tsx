import type { ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  connection: vi.fn(async () => {}),
  cacheTag: vi.fn(),
  cacheLife: vi.fn(),
  db: {
    $queryRaw: vi.fn(async () => []),
  },
}));

vi.mock("next/server", () => ({ connection: h.connection }));
vi.mock("next/cache", () => ({ cacheTag: h.cacheTag, cacheLife: h.cacheLife }));
vi.mock("@/lib/db", () => ({ db: h.db }));

import ConfidentialitePage, {
  metadata as confidentialiteMetadata,
} from "@/app/confidentialite/page";
import ConditionsUtilisationPage, {
  metadata as conditionsMetadata,
} from "@/app/conditions-utilisation/page";
import MentionsLegalesPage from "@/app/mentions-legales/page";
import { NewsletterCTA } from "@/app/recap/NewsletterCTA";
import SupportPage, { metadata as supportMetadata } from "@/app/support/page";
import sitemap from "@/app/sitemap";
import { SITE_URL } from "@/config/site";
import { FOOTER_SECTIONS } from "@/config/navigation";

function renderPage(page: ComponentType) {
  const Page = page;
  const html = renderToStaticMarkup(<Page />);
  const document = new DOMParser().parseFromString(html, "text/html");
  const text = document.body.textContent?.replace(/\s+/g, " ").trim() ?? "";
  return { document, html, text };
}

describe("marketplace legal pages", () => {
  it("exposes the three routes with exact metadata", () => {
    expect(confidentialiteMetadata.title).toBe("Politique de confidentialité");
    expect(confidentialiteMetadata.alternates).toMatchObject({
      canonical: "/confidentialite",
    });
    expect(conditionsMetadata.title).toBe("Conditions d'utilisation");
    expect(conditionsMetadata.alternates).toMatchObject({
      canonical: "/conditions-utilisation",
    });
    expect(supportMetadata.title).toBe("Support PoliGraph");
    expect(supportMetadata.alternates).toMatchObject({ canonical: "/support" });
  });

  it("publishes the verified Association Sankofa identity and contact", () => {
    const { text } = renderPage(ConfidentialitePage);

    expect(text).toContain("Association Sankofa");
    expect(text).toContain("association loi 1901");
    expect(text).toContain("RNA W931031256");
    expect(text).toContain("93800 Épinay-sur-Seine, France");
    expect(text).toContain("contact@poligraph.fr");
    expect(text).toContain(
      "Aucun délégué à la protection des données distinct n'est actuellement déclaré."
    );
  });

  it("documents the MCP flow and the exact application log metadata", () => {
    const { document, text } = renderPage(ConfidentialitePage);

    expect(text).toContain(
      "Client Claude, ChatGPT ou autre client MCP → mcp.poligraph.fr → API publique poligraph.fr"
    );
    expect(text).toContain(
      "Son handler ne copie pas les arguments des tools dans les logs applicatifs."
    );

    const introduction = [...document.querySelectorAll("p")].find((paragraph) =>
      paragraph.textContent?.includes("métadonnées applicatives journalisées")
    );
    const loggedFields = [...(introduction?.nextElementSibling?.querySelectorAll("li") ?? [])].map(
      (item) => item.textContent?.trim()
    );

    expect(loggedFields).toEqual([
      "le timestamp ;",
      "la méthode HTTP ;",
      "la méthode JSON-RPC ;",
      "l'identifiant JSON-RPC ;",
      "le User-Agent ;",
      "l'en-tête Accept.",
    ]);
  });

  it("contains every required structural section", () => {
    const privacyHeadings = [
      "Responsable du traitement",
      "Services couverts",
      "Serveur MCP et connecteurs",
      "Newsletter",
      "Don en ligne",
      "Finalités et bases légales",
      "Destinataires et prestataires",
      "Conservation",
      "Transferts hors Union européenne",
      "Vos droits",
      "Données publiques sur les responsables politiques",
    ];
    const termsHeadings = [
      "Objet du service",
      "Acceptation",
      "Usages permis",
      "Usages interdits",
      "Limites des données",
      "Disponibilité",
      "Plateformes tierces",
      "Propriété intellectuelle et réutilisation",
      "Responsabilité",
      "Droit applicable",
      "Contact et modifications",
    ];
    const supportHeadings = [
      "Problème technique",
      "Erreur de donnée ou demande de rectification",
      "Vulnérabilité",
      "GitHub Issues",
      "Délais",
      "Liens utiles",
    ];

    const privacyText = renderPage(ConfidentialitePage).text;
    const termsText = renderPage(ConditionsUtilisationPage).text;
    const supportText = renderPage(SupportPage).text;
    for (const heading of privacyHeadings) expect(privacyText).toContain(heading);
    for (const heading of termsHeadings) expect(termsText).toContain(heading);
    for (const heading of supportHeadings) expect(supportText).toContain(heading);
  });

  it("avoids unsupported legal, platform and service-level claims", () => {
    const renderedText = [
      renderPage(ConfidentialitePage).text,
      renderPage(ConditionsUtilisationPage).text,
      renderPage(SupportPage).text,
      renderPage(MentionsLegalesPage).text,
    ].join("\n");

    expect(renderedText).not.toContain("Aucune donnée personnelle n'est collectée");
    expect(renderedText).not.toMatch(/conforme au RGPD|certifi[ée]/i);
    expect(renderedText).not.toMatch(/Anthropic.{0,40}sous-traitant/i);
    expect(renderedText).not.toMatch(/OpenAI.{0,40}sous-traitant/i);
    expect(renderPage(SupportPage).text).toContain(
      "Aucun délai général ni niveau de service contractuel n'est promis."
    );
  });

  it("publishes privacy, terms and support links in the project footer", () => {
    const projectLinks = FOOTER_SECTIONS.find((section) => section.title === "Le projet")?.links;

    expect(projectLinks).toEqual(
      expect.arrayContaining([
        { href: "/confidentialite", label: "Confidentialité" },
        { href: "/conditions-utilisation", label: "Conditions d'utilisation" },
        { href: "/support", label: "Support" },
        { href: "/mentions-legales", label: "Mentions légales" },
      ])
    );
  });

  it("points newsletter consent at the privacy page", () => {
    const { document } = renderPage(NewsletterCTA);
    const privacyLink = document.querySelector<HTMLAnchorElement>(
      'a[href="/confidentialite#newsletter"]'
    );

    expect(privacyLink).not.toBeNull();
    expect(document.querySelector('a[href="/mentions-legales#newsletter"]')).toBeNull();
  });

  it("includes all four public legal pages in the sitemap", async () => {
    const entries = await sitemap({ id: Promise.resolve("0") });
    const urls = entries.map(({ url }) => url);

    expect(urls).toEqual(
      expect.arrayContaining([
        SITE_URL + "/mentions-legales",
        SITE_URL + "/confidentialite",
        SITE_URL + "/conditions-utilisation",
        SITE_URL + "/support",
      ])
    );
  });

  it("secures external links and contains no placeholder or credential", () => {
    const renderedPages: string[] = [];
    for (const page of [
      ConfidentialitePage,
      ConditionsUtilisationPage,
      SupportPage,
      MentionsLegalesPage,
    ]) {
      const { document, html } = renderPage(page);
      renderedPages.push(html);
      for (const link of document.querySelectorAll<HTMLAnchorElement>('a[href^="http"]')) {
        expect(link.target).toBe("_blank");
        expect(link.rel).toBe("noopener noreferrer");
      }
    }

    const renderedHtml = renderedPages.join("\n");
    expect(renderedHtml).not.toMatch(/TODO|À compléter|example\.com|support@example\.com/);
    expect(renderedHtml).not.toMatch(/sk-[A-Za-z0-9]|Bearer\s+[A-Za-z0-9]/);
  });
});
