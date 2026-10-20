import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Comments are removed first: a rule named only in prose must not keep the guard green.
const css = readFileSync("src/app/globals.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const layout = readFileSync("src/app/layout.tsx", "utf8");

/** Declarations of the `body { ... }` rule inside `@layer base`. */
function baseBodyRule(): string {
  const layerStart = css.indexOf("@layer base {");
  expect(layerStart, "@layer base introuvable").toBeGreaterThanOrEqual(0);
  const bodyStart = css.indexOf("body {", layerStart);
  expect(bodyStart, "règle body introuvable dans @layer base").toBeGreaterThanOrEqual(0);
  return css.slice(bodyStart, css.indexOf("}", bodyStart));
}

describe("police du corps de page", () => {
  it("applique font-sans à body : sans cela le texte reste en police système", () => {
    // The next/font variables sit on <body>, below <html>: Tailwind's default font stack on
    // <html> never reaches Atkinson unless body asks for it.
    expect(baseBodyRule()).toMatch(/@apply[^;]*\bfont-sans\b/);
  });

  it("relie font-sans à la police de corps chargée par next/font", () => {
    expect(css).toMatch(/--font-sans:\s*var\(--font-body\)/);
    expect(layout).toMatch(/variable:\s*"--font-body"/);
    expect(layout).toMatch(/\$\{atkinson\.variable\}/);
  });
});
