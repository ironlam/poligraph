import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { buildLlmsTxt, LLMS_TXT_SECTIONS } from "@/lib/seo/llms-txt";

describe("buildLlmsTxt", () => {
  const text = buildLlmsTxt(LLMS_TXT_SECTIONS, "https://poligraph.fr");

  it("suit le format llmstxt.org : titre H1, résumé en citation, sections H2", () => {
    const lines = text.split("\n");
    expect(lines[0]).toBe("# Poligraph");
    expect(lines[2]).toMatch(/^> /);
    expect(text).toMatch(/^## /m);
    expect(text).toContain(
      "- [Fact-checks](https://poligraph.fr/factchecks): Déclarations politiques vérifiées"
    );
  });

  it("dit que les verdicts appartiennent aux rédactions citées", () => {
    expect(text).toContain("Les fact-checks ne sont pas écrits par Poligraph");
  });

  it("n'utilise pas de tiret cadratin", () => {
    expect(text).not.toMatch(/[—–]/);
  });

  it.each(LLMS_TXT_SECTIONS.flatMap((s) => s.links.map((l) => l.path)))(
    "%s correspond à une page du site",
    (path) => {
      expect(existsSync(join(process.cwd(), "src/app", path, "page.tsx"))).toBe(true);
    }
  );
});
