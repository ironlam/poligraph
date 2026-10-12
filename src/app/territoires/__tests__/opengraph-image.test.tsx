import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { FRANCE_DROM_INSETS, FRANCE_OUTLINE } from "@/config/territoires-shapes";
import { franceOutlineDataUri } from "@/lib/territoires/region-og-shape";

const mocks = vi.hoisted(() => ({ imageResponses: [] as ReactNode[] }));

vi.mock("next/og", () => ({
  ImageResponse: class {
    constructor(element: ReactNode) {
      mocks.imageResponses.push(element);
    }
  },
}));

import OgImage, { alt, size } from "../opengraph-image";

function decode(uri: string): string {
  return Buffer.from(uri.split(",")[1]!, "base64").toString("utf-8");
}

describe("image Open Graph de l'entrée Territoires", () => {
  it("dessine la France métropolitaine et les cinq DROM en cartouches", () => {
    const svg = decode(franceOutlineDataUri());
    expect(svg).toContain(`viewBox="${FRANCE_DROM_INSETS.viewBox}"`);
    expect(svg.match(/<path /g)).toHaveLength(
      Object.keys(FRANCE_OUTLINE.departments).length + FRANCE_DROM_INSETS.boxes.length
    );
    expect(svg.match(/<rect /g)).toHaveLength(5);
  });

  it("porte l'accroche de la rubrique et la silhouette, au format Open Graph", async () => {
    await OgImage();
    const tree = JSON.stringify(mocks.imageResponses.at(-1));
    expect(tree).toContain("Les élus et les décisions de votre territoire");
    expect(tree).toContain("Territoires · communes, départements, régions");
    expect(tree).toContain("data:image/svg+xml;base64,");
    expect(tree).not.toMatch(/[—–]/);
    expect(size).toEqual({ width: 1200, height: 630 });
    expect(alt).toContain("Territoires");
  });
});
