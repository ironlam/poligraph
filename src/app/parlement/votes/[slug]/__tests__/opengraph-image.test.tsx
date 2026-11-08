import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  imageResponses: [] as Array<{ element: ReactNode; options: { fonts?: unknown[] } }>,
  findUnique: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/og", () => ({
  ImageResponse: class {
    constructor(element: ReactNode, options: { fonts?: unknown[] }) {
      mocks.imageResponses.push({ element, options });
    }
  },
}));
vi.mock("@/lib/db", () => ({ db: { scrutin: { findUnique: mocks.findUnique } } }));
vi.mock("@/lib/og/fonts", () => ({
  OG_FONT_DISPLAY: "Outfit",
  OG_FONT_TEXT: "Atkinson Hyperlegible",
  loadOgFonts: async () => [{ name: "Outfit", weight: 700 }],
}));

import Image from "../opengraph-image";

function textContent(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textContent).join(" ");
  if (!node || typeof node === "boolean") return "";
  if (typeof node === "object" && "props" in node) {
    const { type, props } = node as { type: unknown; props: Record<string, unknown> };
    if (typeof type === "function") return textContent((type as (p: unknown) => ReactNode)(props));
    return textContent(props.children as ReactNode);
  }
  return "";
}

function backgrounds(node: ReactNode): string[] {
  if (Array.isArray(node)) return node.flatMap(backgrounds);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const { type, props } = node as { type: unknown; props: Record<string, unknown> };
  if (typeof type === "function") return backgrounds((type as (p: unknown) => ReactNode)(props));
  const style = props.style as { background?: string } | undefined;
  const own = style?.background ? [style.background] : [];
  return [...own, ...backgrounds(props.children as ReactNode)];
}

const scrutin = (overrides: Record<string, unknown> = {}) => ({
  title: "la première partie du projet de loi de finances pour 2027 (première lecture).",
  externalId: "VTANR5L17V9759",
  votingDate: new Date("2026-11-04T17:30:00Z"),
  result: "REJECTED",
  chamber: "AN",
  theme: null,
  sourceUrl: "https://www.assemblee-nationale.fr/dyn/17/scrutins/9759",
  votesFor: 0,
  votesAgainst: 458,
  votesAbstain: 2,
  policyTitle: {
    status: "APPROVED",
    policyTitle:
      "L'Assemblée rejette la partie recettes du budget 2027, ce qui fait tomber tout le texte",
    policySubtitle: null,
    officialSourceUrl: null,
    proceduralLabel: null,
  },
  ...overrides,
});

async function render(slug = "2026-11-04-plf") {
  await Image({ params: Promise.resolve({ slug }) });
  return mocks.imageResponses[0];
}

describe("Open Graph d'un scrutin", () => {
  beforeEach(() => {
    mocks.imageResponses.length = 0;
    mocks.findUnique.mockReset();
  });

  it("montre le titre explicatif, le résultat, les décomptes et la source", async () => {
    mocks.findUnique.mockResolvedValueOnce(scrutin());
    const text = textContent((await render())?.element);

    expect(text).toContain("L'Assemblée rejette la partie recettes du budget 2027");
    expect(text).toContain("Rejeté");
    expect(text).toContain("Vote du 4 novembre 2026 · Scrutin n° 9759");
    expect(text).toContain("460");
    expect(text).toContain("Contre");
    expect(text).toContain("458");
    expect(text).toContain("Source officielle : Assemblée nationale");
  });

  it("passe les polices de marque au moteur de rendu", async () => {
    mocks.findUnique.mockResolvedValueOnce(scrutin());
    expect((await render())?.options.fonts).toHaveLength(1);
  });

  it("n'affiche pas un titre explicatif non approuvé", async () => {
    mocks.findUnique.mockResolvedValueOnce(
      scrutin({ policyTitle: { ...scrutin().policyTitle, status: "PENDING" } })
    );
    const text = textContent((await render())?.element);

    expect(text).not.toContain("L'Assemblée rejette");
    expect(text).toContain("Vote sur la première partie du projet de loi de finances pour 2027");
  });

  it("utilise les couleurs de vote désaturées du design system", async () => {
    mocks.findUnique.mockResolvedValueOnce(scrutin());
    const fills = backgrounds((await render())?.element);

    expect(fills).toContain("#c88a8a");
    expect(fills).not.toContain("#22c55e");
    expect(fills).not.toContain("#ef4444");
  });

  it("retombe sur l'identifiant quand le slug ne correspond à rien", async () => {
    mocks.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(scrutin());
    await render("cuid123");
    expect(mocks.findUnique).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { id: "cuid123" } })
    );
  });

  it("rend une carte neutre pour un scrutin introuvable", async () => {
    mocks.findUnique.mockResolvedValue(null);
    expect(textContent((await render())?.element)).toContain("Scrutin non trouvé");
  });
});
