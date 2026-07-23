import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { BRAND_SVG_COLORS } from "../brand";

const FILES = ["logo.svg", "logo-inverse.svg", "logo-mono.svg"];
const ALLOWED = new Set(
  [...BRAND_SVG_COLORS, "#fff", "none", "transparent"].map((c) => c.toLowerCase())
);

function readSvg(name: string): string {
  return readFileSync(resolve(process.cwd(), "public", name), "utf8");
}

describe("brand SVG assets", () => {
  for (const name of FILES) {
    describe(name, () => {
      const svg = readSvg(name);

      it("has no opaque white background rect", () => {
        expect(svg).not.toMatch(/<rect[^>]*fill=["']?#(fff|ffffff|white)/i);
      });

      it("uses only the canonical palette", () => {
        const colors = [...svg.matchAll(/(?:fill|stroke)=["']?(#[0-9a-fA-F]{3,8})/g)].map((m) =>
          (m[1] ?? "").toLowerCase()
        );
        const disallowed = colors.filter((c) => !ALLOWED.has(c));
        expect(disallowed).toEqual([]);
      });

      it("contains no gradients, filters, masks or raster images", () => {
        expect(svg).not.toMatch(/<(linearGradient|radialGradient|filter|mask|clipPath|image)\b/i);
      });

      it("declares a viewBox", () => {
        expect(svg).toMatch(/viewBox=/);
      });
    });
  }
});
