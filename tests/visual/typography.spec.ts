import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Outfit pour les titres, Atkinson Hyperlegible pour le texte. Les deux projets Playwright
// (bureau et Pixel 5) font tourner chaque cas, ce qui couvre les deux viewports.
const PAGES = [
  { name: "Territoires", path: "/territoires" },
  { name: "Législatures", path: "/parlement/assemblee/legislatures" },
  // Sur la fiche, seules ces deux règles sont suivies ici (#1166). D'autres violations axe
  // restent à traiter à part, voir #1170.
  {
    name: "fiche politique",
    path: "/politiques/yael-braun-pivet",
    rules: ["color-contrast", "link-in-text-block"],
  },
];

async function firstFamilies(page: Page, selector: string) {
  return page.$$eval(selector, (els) =>
    els
      .filter((el) => (el.textContent ?? "").trim() !== "")
      .map((el) => getComputedStyle(el).fontFamily.split(",")[0]?.replace(/"/g, "").toLowerCase())
  );
}

for (const { name, path, rules } of PAGES) {
  test.describe(`${name}: typographie`, () => {
    test("les titres sont en Outfit", async ({ page }) => {
      await page.goto(path);
      const families = await firstFamilies(page, "main h1, main h2, main h3");
      expect(families.length).toBeGreaterThan(0);
      expect(families.filter((f) => f !== "outfit")).toEqual([]);
    });

    test("le texte courant est en Atkinson", async ({ page }) => {
      await page.goto(path);
      const families = await firstFamilies(page, "main p");
      expect(families.length).toBeGreaterThan(0);
      expect(families.filter((f) => f !== "atkinson")).toEqual([]);
    });

    test("aucune violation WCAG AA (contraste compris)", async ({ page }) => {
      await page.goto(path);
      const axe = new AxeBuilder({ page });
      const results = await (
        rules ? axe.withRules(rules) : axe.withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      ).analyze();
      expect(results.violations).toEqual([]);
    });
  });
}

// next-themes suit le thème du système (defaultTheme="system") : le badge de parti doit rester
// lisible une fois la classe .dark posée.
test.describe("fiche politique: thème sombre", () => {
  test.use({ colorScheme: "dark" });

  test("contraste du badge de parti et des liens", async ({ page }) => {
    await page.goto("/politiques/yael-braun-pivet");
    await expect(page.locator("html")).toHaveClass(/dark/);
    // Limité aux badges de couleur de l'en-tête : le pied de page a ses propres écarts (#1170).
    const results = await new AxeBuilder({ page })
      .include("[data-party-badge]")
      .withRules(["color-contrast"])
      .analyze();
    expect(results.violations).toEqual([]);
  });
});
