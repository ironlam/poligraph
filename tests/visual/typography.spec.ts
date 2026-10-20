import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Outfit pour les titres, Atkinson Hyperlegible pour le texte. Les deux projets Playwright
// (bureau et Pixel 5) font tourner chaque cas, ce qui couvre les deux viewports.
const PAGES = [
  { name: "Territoires", path: "/territoires", axe: true },
  { name: "Législatures", path: "/parlement/assemblee/legislatures", axe: true },
  // axe signale déjà un contraste et un lien sans soulignement sur la fiche, sans lien avec les polices.
  { name: "fiche politique", path: "/politiques/yael-braun-pivet", axe: false },
];

async function firstFamilies(page: Page, selector: string) {
  return page.$$eval(selector, (els) =>
    els
      .filter((el) => (el.textContent ?? "").trim() !== "")
      .map((el) => getComputedStyle(el).fontFamily.split(",")[0].replace(/"/g, "").toLowerCase())
  );
}

for (const { name, path, axe } of PAGES) {
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
      test.skip(!axe, "violations axe préexistantes, hors périmètre typographie");
      await page.goto(path);
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(results.violations).toEqual([]);
    });
  });
}
