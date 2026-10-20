import { test, expect } from "@playwright/test";

// Échelle des titres (globals.css : title-page, title-section, title-card). Le projet bureau est
// au-dessus du seuil de 640 px, le projet Pixel 5 en dessous.
test.describe("Législatures: échelle des titres", () => {
  test("h1, h2 de section et h3 de carte suivent l'échelle", async ({ page, viewport }) => {
    const wide = (viewport?.width ?? 0) >= 640;
    await page.goto("/parlement/assemblee/legislatures");
    const size = (selector: string) =>
      page
        .locator(selector)
        .first()
        .evaluate((el) => getComputedStyle(el).fontSize);

    expect(await size("main h1")).toBe(wide ? "38px" : "30px");
    expect(await size("main h2#frise-titre")).toBe(wide ? "24px" : "22px");
    expect(await size("main h2#cartes-titre + * h3")).toBe(wide ? "20px" : "18px");
  });
});
