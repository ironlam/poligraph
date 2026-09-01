import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAffairs: vi.fn(),
  getPartiesWithAffairs: vi.fn(),
  getPublicPartyMetadataBySlug: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/lib/data/affairs", () => ({
  getAffairs: mocks.getAffairs,
  getSuperCategoryCounts: vi.fn().mockResolvedValue({}),
  getCertaintyCounts: vi.fn().mockResolvedValue({}),
  getPartiesWithAffairs: mocks.getPartiesWithAffairs,
  getPublicPartyMetadataBySlug: mocks.getPublicPartyMetadataBySlug,
}));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));

import AffairesPage from "./page";

/** Concatenate every string leaf of a rendered element tree. */
function textOf(node: unknown): string {
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (node && typeof node === "object") {
    const props = (node as { props?: { children?: unknown } }).props;
    return props ? textOf(props.children) : "";
  }
  return "";
}

const renderText = async (searchParams: Record<string, string>) =>
  textOf(
    await (
      AffairesPage as (p: { searchParams: Promise<Record<string, string>> }) => Promise<unknown>
    )({ searchParams: Promise.resolve(searchParams) })
  );

describe("/affaires : le message d'état vide dit de quel périmètre il parle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Zéro résultat : c'est le cas qui rend l'état vide.
    mocks.getAffairs.mockResolvedValue({ affairs: [], total: 0, totalPages: 0 });
    mocks.getPartiesWithAffairs.mockResolvedValue([]);
    mocks.getPublicPartyMetadataBySlug.mockResolvedValue(null);
  });

  it("nomme le parti quand le filtre porte sur un parti sans affaire", async () => {
    mocks.getPublicPartyMetadataBySlug.mockResolvedValue({
      name: "Place publique",
      shortName: "PP",
    });

    const text = await renderText({ parti: "place-publique" });

    expect(text).toContain("Aucune affaire documentée pour Place publique");
    // La prudence reste portée par le paragraphe existant, pas dupliquée au-dessus.
    expect(text).toContain("ne prétend pas à l'exhaustivité");
  });

  it("signale le filtrage pour status et category, qui étaient muets", async () => {
    await expect(renderText({ status: "RELAXE" })).resolves.toContain(
      "Aucune affaire documentée avec ces filtres"
    );
    await expect(renderText({ category: "CORRUPTION" })).resolves.toContain(
      "Aucune affaire documentée avec ces filtres"
    );
  });

  it("conserve le comportement des filtres déjà couverts", async () => {
    const cases: Record<string, string>[] = [
      { search: "x" },
      { certainty: "avere" },
      { supercat: "probite" },
    ];
    for (const params of cases) {
      await expect(renderText(params)).resolves.toContain(
        "Aucune affaire documentée avec ces filtres"
      );
    }
  });

  it("reste une phrase nue sur le listing sans filtre", async () => {
    const text = await renderText({});

    expect(text).toContain("Aucune affaire documentée");
    expect(text).not.toContain("avec ces filtres");
    expect(text).not.toContain("pour ");
  });
});
