import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  imageResponses: [] as ReactNode[],
  getGroupeDetail: vi.fn(),
  getPlacement: vi.fn(),
  getPositions: vi.fn(),
}));

vi.mock("next/og", () => ({
  ImageResponse: class {
    constructor(element: ReactNode) {
      mocks.imageResponses.push(element);
    }
  },
}));
vi.mock("@/lib/data/groupes", () => ({
  getGroupeDetail: mocks.getGroupeDetail,
  getGroupHemicyclePlacement: mocks.getPlacement,
}));
vi.mock("@/lib/data/government-project-positions", () => ({
  getGovernmentProjectPositionsForGroup: mocks.getPositions,
}));
vi.mock("@/lib/og/fonts", () => ({
  OG_FONT_DISPLAY: "Outfit",
  OG_FONT_TEXT: "Atkinson Hyperlegible",
  loadOgFonts: async () => undefined,
}));

import Image from "../opengraph-image";

function collect(node: ReactNode, out: { text: string[]; fills: string[] }) {
  if (typeof node === "string" || typeof node === "number") {
    out.text.push(String(node));
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((child) => collect(child, out));
    return;
  }
  if (!node || typeof node !== "object" || !("props" in node)) return;
  const { type, props } = node as { type: unknown; props: Record<string, unknown> };
  if (typeof type === "function") {
    collect((type as (p: unknown) => ReactNode)(props), out);
    return;
  }
  if (type === "circle") out.fills.push(String(props.fill));
  collect(props.children as ReactNode, out);
}

async function render() {
  await Image({ params: Promise.resolve({ slug: "rn-an-17" }) });
  const out = { text: [] as string[], fills: [] as string[] };
  collect(mocks.imageResponses[0], out);
  return { text: out.text.join(" "), fills: out.fills };
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

describe("Open Graph d'un groupe parlementaire", () => {
  beforeEach(() => {
    mocks.imageResponses.length = 0;
    mocks.getGroupeDetail.mockReset();
    mocks.getPlacement.mockReset();
    mocks.getPositions.mockReset();
  });

  it("shows the seats, where they sit, and the positions on government bills", async () => {
    mocks.getGroupeDetail.mockResolvedValue(group());
    mocks.getPlacement.mockResolvedValue({ before: 442, seats: 121, total: 574 });
    mocks.getPositions.mockResolvedValue({
      rows: [],
      summary: {
        counts: { POUR: 30, ABSTENTION: 3, CONTRE: 4 },
        updatedAt: new Date("2026-11-13T08:00:00Z"),
      },
    });
    const { text, fills } = await render();

    expect(text).toContain("Rassemblement National");
    expect(text).toContain("121");
    expect(text).toContain("députés");
    expect(text).toContain("des 574 sièges occupés");
    expect(text).toContain("Votes sur les projets de loi du gouvernement");
    expect(text).toContain("81 %");
    expect(text).toContain("17e législature");
    // Lit seats are white for every group, never the group's own colour.
    expect(fills).toContain("#ffffff");
    expect(fills).not.toContain("#0D378A");
  });

  it("draws no government block for a Senate group", async () => {
    mocks.getGroupeDetail.mockResolvedValue(
      group({ chamber: "SENAT", code: "LR", name: "Les Républicains", legislature: null })
    );
    mocks.getPlacement.mockResolvedValue({ before: 200, seats: 130, total: 348 });
    const { text } = await render();

    expect(mocks.getPositions).not.toHaveBeenCalled();
    expect(text).toContain("sénateurs");
    expect(text).toContain("Source : Sénat");
    expect(text).not.toContain("projets de loi");
  });

  it("invents no seat for a group without a place on the benches", async () => {
    mocks.getGroupeDetail.mockResolvedValue(group({ code: "NI", name: "Non inscrits" }));
    mocks.getPlacement.mockResolvedValue(null);
    const { text, fills } = await render();

    expect(fills).toHaveLength(0);
    expect(text).not.toContain("sièges occupés");
    expect(mocks.getPositions).not.toHaveBeenCalled();
  });

  it("falls back to a neutral card for an unknown group", async () => {
    mocks.getGroupeDetail.mockResolvedValue(null);
    const { text } = await render();
    expect(text).toContain("Groupe non trouvé");
    expect(mocks.getPlacement).not.toHaveBeenCalled();
  });
});
