import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ModerationDossierLink } from "../_data/dossier-links-query";

/**
 * The admin layout renders its children for an anonymous visitor, so the page has to check the
 * session itself, and before reading anything.
 */

const redirectMock = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`);
});
const isAuthenticatedMock = vi.fn<() => Promise<boolean>>();
const queryMock = vi.fn(
  async (): Promise<{ links: ModerationDossierLink[]; capped: boolean }> => ({
    links: [],
    capped: false,
  })
);

vi.mock("next/navigation", () => ({ redirect: (path: string) => redirectMock(path) }));
vi.mock("@/lib/auth", () => ({ isAuthenticated: () => isAuthenticatedMock() }));
vi.mock("../_data/dossier-links-query", () => ({
  queryDossierLinksForModeration: () => queryMock(),
}));
vi.mock("../actions", () => ({ deleteDossierLinkAction: vi.fn(async () => ({ ok: true })) }));

describe("écran des rapprochements avec le Parlement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirige vers la connexion sans session, avant toute lecture", async () => {
    isAuthenticatedMock.mockResolvedValue(false);
    const { default: Page } = await import("../rapprochements/page");

    await expect(Page()).rejects.toThrow("REDIRECT:/admin/login");
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("lit les rapprochements quand la session est valide", async () => {
    isAuthenticatedMock.mockResolvedValue(true);
    const { default: Page } = await import("../rapprochements/page");

    await Page();
    expect(queryMock).toHaveBeenCalledOnce();
  });

  it("affiche les rapprochements groupés par dossier et signale une ancienne formulation", async () => {
    isAuthenticatedMock.mockResolvedValue(true);
    const base = {
      linkKind: "SAME_OBJECT" as const,
      measureQuote: "Plafonner les frais bancaires",
      textQuote: "Plafonner et supprimer les frais bancaires injustes",
      rationale: "Même dispositif.",
      searchMethod: "poc",
      reviewedBy: "admin",
      checkedAt: new Date("2026-10-30T10:00:00Z"),
      measureText: "Plafonner les frais bancaires",
      dossierId: "d1",
      dossierTitle: "Plafonner les frais bancaires injustes",
      dossierSlug: "plafonner-frais",
    };
    queryMock.mockResolvedValueOnce({
      links: [
        { ...base, id: "l1", measureId: "m1", isCurrent: true },
        { ...base, id: "l2", measureId: "m2", isCurrent: false, linkKind: "BROADER_TEXT" as const },
      ],
      capped: false,
    });
    const { default: Page } = await import("../rapprochements/page");

    const html = renderToStaticMarkup(await Page());
    expect(html).toContain("2 rapprochements relus");
    expect(html.match(/Plafonner les frais bancaires injustes<\/h2>/g)).toHaveLength(1);
    expect(html).toContain("Même objet");
    expect(html).toContain("Texte plus large");
    expect(html).toContain("Ancienne formulation de la mesure");
    expect(html).toContain("/parlement/dossiers/plafonner-frais");
  });

  it("affiche un état vide sans rapprochement", async () => {
    isAuthenticatedMock.mockResolvedValue(true);
    const { default: Page } = await import("../rapprochements/page");

    expect(renderToStaticMarkup(await Page())).toContain("Aucun rapprochement relu");
  });
});
