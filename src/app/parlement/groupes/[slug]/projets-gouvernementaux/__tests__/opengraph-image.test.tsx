import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  imageResponses: [] as Array<{ element: ReactNode; options: { fonts?: unknown[] } }>,
  getGroupeDetail: vi.fn(),
  getPositions: vi.fn(),
}));

vi.mock("next/og", () => ({
  ImageResponse: class {
    constructor(element: ReactNode, options: { fonts?: unknown[] }) {
      mocks.imageResponses.push({ element, options });
    }
  },
}));
vi.mock("@/lib/data/groupes", () => ({ getGroupeDetail: mocks.getGroupeDetail }));
vi.mock("@/lib/data/government-project-positions", () => ({
  getGovernmentProjectPositionsForGroup: mocks.getPositions,
}));
vi.mock("@/lib/og/fonts", () => ({
  OG_FONT_DISPLAY: "Outfit",
  OG_FONT_TEXT: "Atkinson Hyperlegible",
  loadOgFonts: async () => [{ name: "Outfit", weight: 800 }],
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

const group = (overrides: Record<string, unknown> = {}) => ({
  id: "g1",
  code: "RN",
  name: "Rassemblement National",
  color: "#0D378A",
  chamber: "AN",
  legislature: 17,
  seatCount: 121,
  ...overrides,
});

const positions = (POUR: number, ABSTENTION: number, CONTRE: number) => ({
  rows: [],
  summary: {
    counts: { POUR, ABSTENTION, CONTRE },
    updatedAt: new Date("2026-11-13T08:00:00Z"),
  },
});

async function render(slug = "rn-an-17") {
  await Image({ params: Promise.resolve({ slug }) });
  const response = mocks.imageResponses[0]!;
  return { text: textContent(response.element), options: response.options };
}

describe("Open Graph des positions d'un groupe sur les projets du gouvernement", () => {
  beforeEach(() => {
    mocks.imageResponses.length = 0;
    mocks.getGroupeDetail.mockReset();
    mocks.getPositions.mockReset();
  });

  it("sets the most frequent position in large type and keeps all three in the legend", async () => {
    mocks.getGroupeDetail.mockResolvedValue(group());
    mocks.getPositions.mockResolvedValue(positions(30, 3, 4));
    const { text, options } = await render();

    expect(text).toContain("Votes sur les projets de loi du gouvernement");
    expect(text).toContain("Rassemblement National");
    expect(text).toContain("121 députés");
    expect(text).toContain("81 %");
    for (const label of ["Pour", "Abstention", "Contre", "8 %", "11 %"]) {
      expect(text).toContain(label);
    }
    expect(text).toContain("37 scrutins");
    expect(text).toContain("au 13 nov. 2026");
    expect(options.fonts).toHaveLength(1);
  });

  it("applies the same rule to a group voting mostly against", async () => {
    mocks.getGroupeDetail.mockResolvedValue(group({ code: "LFI-NFP", name: "LFI" }));
    mocks.getPositions.mockResolvedValue(positions(7, 5, 25));
    const { text } = await render();
    expect(text).toContain("68 %");
    expect(text).toContain("Contre");
  });

  it("never qualifies the group with an editorial word", async () => {
    mocks.getGroupeDetail.mockResolvedValue(group());
    mocks.getPositions.mockResolvedValue(positions(30, 3, 4));
    const { text } = await render();
    expect(text.toLowerCase()).not.toMatch(/soutien|opposition|opposant|allié/);
  });

  it("leads with no figure on a tie", async () => {
    mocks.getGroupeDetail.mockResolvedValue(group());
    mocks.getPositions.mockResolvedValue(positions(10, 2, 10));
    const { text } = await render();
    // Only the legend prints 45 %, once per side: no headline figure picks one of them.
    expect(text.match(/45 %/g)).toHaveLength(2);
  });

  it("says when no position could be computed", async () => {
    mocks.getGroupeDetail.mockResolvedValue(group());
    mocks.getPositions.mockResolvedValue(positions(0, 0, 0));
    const { text } = await render();
    expect(text).toContain("Aucune position calculable");
  });

  it.each([
    ["an unknown group", null],
    ["a Senate group", group({ chamber: "SENAT" })],
    ["the non-inscrits", group({ code: "NI" })],
  ])("describes no page that 404s: %s", async (_label, value) => {
    mocks.getGroupeDetail.mockResolvedValue(value);
    const { text } = await render();
    expect(text).toContain("Groupe non trouvé");
    expect(mocks.getPositions).not.toHaveBeenCalled();
  });
});
