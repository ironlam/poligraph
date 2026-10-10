import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  db: { $queryRaw: vi.fn(async () => []) },
}));

vi.mock("next/server", () => ({ connection: vi.fn(async () => {}) }));
vi.mock("next/cache", () => ({ cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/feature-flags", () => ({ isFeatureEnabled: async () => false }));

import EspacePressePage, { metadata } from "@/app/espace-presse/page";
import sitemap from "@/app/sitemap";
import { FOOTER_SECTIONS } from "@/config/navigation";
import { DATAGOUV_REUSES, PRESS_MENTIONS, PRESS_SPACE_UPDATED_AT } from "@/config/press-space";
import { SITE_URL } from "@/config/site";

function render() {
  const html = renderToStaticMarkup(<EspacePressePage />);
  const document = new DOMParser().parseFromString(html, "text/html");
  const text = document.body.textContent?.replace(/\s+/g, " ").trim() ?? "";
  return { document, text };
}

describe("/espace-presse", () => {
  it("is self-canonical", () => {
    expect(metadata.title).toBe("Presse et partenaires");
    expect(metadata.alternates).toMatchObject({ canonical: "/espace-presse" });
  });

  it("renders the four anchored sections", () => {
    const { document } = render();
    for (const id of ["mentions", "kit", "collaborer", "contributeurs"]) {
      expect(document.getElementById(id), id).not.toBeNull();
      expect(document.querySelector(`nav a[href="#${id}"]`), id).not.toBeNull();
    }
  });

  it("shows every mention with its source, archive and consultation date", () => {
    const { document, text } = render();
    for (const mention of PRESS_MENTIONS) {
      expect(text).toContain(mention.quote);
      expect(document.querySelector(`a[href="${mention.url}"]`), mention.source).not.toBeNull();
      expect(
        document.querySelector(`a[href="${mention.archiveUrl}"]`),
        mention.source
      ).not.toBeNull();
    }
    expect(text).toContain("Consulté le 10 octobre 2026");
  });

  it("links every data.gouv.fr reuse inside the mentions section", () => {
    const { document } = render();
    for (const reuse of DATAGOUV_REUSES) {
      expect(
        document.querySelector(`#mentions a[href="${reuse.url}"]`),
        reuse.title
      ).not.toBeNull();
    }
  });

  // Standalone links need a 44 px touch target (AGENTS.md, accessibility).
  it("gives standalone links a 44 px touch target", () => {
    const { document } = render();
    const standalone = [
      ...DATAGOUV_REUSES.map((r) => document.querySelector(`a[href="${r.url}"]`)),
      ...document.querySelectorAll("a[download]"),
    ];
    expect(standalone.length).toBeGreaterThan(0);
    for (const a of standalone) {
      expect(a?.className, a?.getAttribute("href") ?? "").toContain("min-h-11");
    }
  });

  it("names no contributor who has not agreed", () => {
    const { text } = render();
    // No entry carries consentedAt yet: the section must stay anonymous.
    for (const handle of ["DidiLJ", "LaBinocle21", "bazmap", "intelarti11", "virginielenk-spec"]) {
      expect(text).not.toContain(handle);
    }
  });

  it("offers every logo for download, including a PNG", () => {
    const { document } = render();
    const files = [...document.querySelectorAll("a[download]")].map((a) => a.getAttribute("href"));
    expect(files).toEqual(
      expect.arrayContaining([
        "/logo.svg",
        "/logo-mono.svg",
        "/logo-inverse.svg",
        "/logo-poligraph-1024.png",
      ])
    );
  });

  it("opens external links safely", () => {
    const { document } = render();
    const external = [...document.querySelectorAll('a[href^="http"]')];
    expect(external.length).toBeGreaterThan(0);
    for (const a of external) {
      expect(a.getAttribute("target"), a.getAttribute("href") ?? "").toBe("_blank");
      expect(a.getAttribute("rel"), a.getAttribute("href") ?? "").toContain("noopener");
    }
  });

  it("is linked from the footer and listed in the sitemap with a fixed date", async () => {
    const links = FOOTER_SECTIONS.find((s) => s.title === "Le projet")?.links;
    expect(links).toEqual(
      expect.arrayContaining([{ href: "/espace-presse", label: "Presse et partenaires" }])
    );

    const entries = await sitemap({ id: Promise.resolve("0") });
    const entry = entries.find((e) => e.url === `${SITE_URL}/espace-presse`);
    expect(entry?.lastModified).toEqual(new Date(PRESS_SPACE_UPDATED_AT));
  });
});
