import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import {
  DEFAULT_LISTING_INVOLVEMENTS,
  VICTIM_LISTING_INVOLVEMENTS,
} from "@/lib/affairs/public-filters";
import { AffairesFilterBar } from "@/components/affairs/AffairesFilterBar";
import { AffairHubTiles } from "@/components/affairs/AffairHubTiles";
import { BandeauFilterForm } from "@/components/ui/BandeauFilterForm";

const FACETS = { ETABLI: 7, PRONONCE: 3, EN_COURS: 5, CLOS_SANS_CHARGE: 1, CLOS_FAVORABLE: 2 };
const ADVERSE = { ETABLI: 4, PRONONCE: 2, EN_COURS: 1, CLOS_SANS_CHARGE: 0, CLOS_FAVORABLE: 0 };

const mocks = vi.hoisted(() => ({
  getAffairs: vi.fn(),
  getCertaintyFacetCounts: vi.fn(),
  getAdverseCertaintyCounts: vi.fn(),
  getSuperCategoryCounts: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/data/affairs", () => ({
  getAffairs: mocks.getAffairs,
  getSuperCategoryCounts: mocks.getSuperCategoryCounts,
  getCertaintyFacetCounts: mocks.getCertaintyFacetCounts,
  getAdverseCertaintyCounts: mocks.getAdverseCertaintyCounts,
  getPartiesWithAffairs: vi.fn().mockResolvedValue([]),
  getPublicPartyMetadataBySlug: vi.fn().mockResolvedValue(null),
}));
vi.mock("next/navigation", () => ({ notFound: vi.fn() }));

import AffairesPage from "../page";

/** Premier élément du rendu (non exécuté) dont le type est `component`. */
function findElement(node: unknown, component: unknown): ReactElement | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findElement(child, component);
      if (found) return found;
    }
    return null;
  }
  if (!node || typeof node !== "object") return null;
  const element = node as ReactElement<{ children?: unknown }>;
  if (element.type === component) return element;
  return element.props ? findElement(element.props.children, component) : null;
}

const renderTree = async (searchParams: Record<string, string>) =>
  (AffairesPage as (p: { searchParams: Promise<Record<string, string>> }) => Promise<unknown>)({
    searchParams: Promise.resolve(searchParams),
  });

describe("/affaires : facettes documentaires et tuile à charge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAffairs.mockResolvedValue({ affairs: [], total: 0, totalPages: 0 });
    mocks.getCertaintyFacetCounts.mockResolvedValue(FACETS);
    mocks.getAdverseCertaintyCounts.mockResolvedValue(ADVERSE);
    mocks.getSuperCategoryCounts.mockResolvedValue({});
  });

  it.each([
    ["mise-en-cause", { search: "x" }, DEFAULT_LISTING_INVOLVEMENTS],
    ["victime", { mode: "victime" }, VICTIM_LISTING_INVOLVEMENTS],
  ] as const)(
    "mode %s : la barre de filtres reçoit les facettes du périmètre listé",
    async (_mode, params, involvements) => {
      const tree = await renderTree(params);

      expect(mocks.getCertaintyFacetCounts).toHaveBeenCalledWith([...involvements]);
      expect(mocks.getSuperCategoryCounts).toHaveBeenCalledWith([...involvements]);
      expect(mocks.getAffairs.mock.calls[0]?.[6]).toEqual([...involvements]);
      const filterBar = findElement(tree, AffairesFilterBar) as ReactElement<{
        certaintyCounts: unknown;
      }> | null;
      expect(filterBar?.props.certaintyCounts).toBe(FACETS);
    }
  );

  it("accueil nu : le formulaire du bandeau reçoit les mêmes facettes, sans barre de filtres", async () => {
    const tree = await renderTree({});

    expect(findElement(tree, AffairesFilterBar)).toBeNull();
    const form = findElement(tree, BandeauFilterForm) as ReactElement<{
      selects: { name: string; options: { value: string; label: string }[] }[];
    }> | null;
    const certainty = form?.props.selects.find((s) => s.name === "certainty");
    expect(certainty?.options.find((o) => o.value === "ETABLI")?.label).toContain("(7)");
  });

  it("la tuile Condamnations définitives affiche le compte à charge, pas la facette", async () => {
    const tree = await renderTree({});

    const tiles = findElement(tree, AffairHubTiles) as ReactElement<{
      etabliCount: number;
    }> | null;
    expect(tiles?.props.etabliCount).toBe(ADVERSE.ETABLI);
  });
});
