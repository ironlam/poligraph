import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * Accessibility and responsive checks for the public presidential subject page.
 *
 * Needs the disposable container seeded with the fictional subject fixtures, and a dev server pointed
 * at it (never production: `.env` and `.env.prod` share the same Supabase database):
 *
 *   docker compose -f docker-compose.test-search.yml up -d
 *   DATABASE_URL=postgresql://poligraph_test:poligraph_test@localhost:55433/poligraph_test?sslmode=disable \
 *     npx prisma db push --url "$DATABASE_URL" --accept-data-loss
 *   DATABASE_URL=... npx tsx scripts/seed-presidentielle-sujet-demo.ts
 *   DATABASE_URL=... npm run dev
 *   npx playwright test presidentielle-sujet --project=chromium
 *
 * The page is public, so no session is forged: it is read exactly as a visitor sees it.
 */

const WCAG = ["wcag2a", "wcag2aa", "wcag21aa"];
const SUBJECT_PATH = "/presidentielle-2027/sujets/logement-urbanisme";
const WIDTHS = [375, 768, 1440];

/**
 * How far the PAGE can actually be scrolled sideways, not `scrollWidth - clientWidth` (which also counts
 * content clipped by overflow:hidden and legitimate inner scrollers). Asking the browser to scroll and
 * reading back where it landed measures what a visitor experiences.
 */
async function horizontalScroll(page: Page): Promise<number> {
  return page.evaluate(() => {
    window.scrollTo(2000, 0);
    const x = window.scrollX;
    window.scrollTo(0, 0);
    return x;
  });
}

test.describe("page sujet publique de la présidentielle 2027", () => {
  test("rend la comparaison seedée avec preuves et absence qualifiée", async ({ page }) => {
    await page.goto(SUBJECT_PATH);

    await expect(page.getByRole("heading", { level: 1 })).toContainText("Logement & Urbanisme");
    await expect(page.getByRole("heading", { level: 2, name: "Alix Démo" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Bruno Démo" })).toBeVisible();
    await expect(page.getByText("Encadrer les loyers dans les zones tendues.")).toBeVisible();
    // The evidence is on screen, not hidden behind trust.
    await expect(page.getByRole("link", { name: "Discours de campagne" }).first()).toBeVisible();
    // Chloé has no measure on the theme: a qualified absence, never a silent blank.
    await expect(page.locator('[data-absence-kind="no_measure_published"]').first()).toBeVisible();
  });

  for (const width of WIDTHS) {
    test(`n'a aucune violation WCAG AA ni débordement horizontal à ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(SUBJECT_PATH);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

      expect(await horizontalScroll(page)).toBe(0);

      const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
      expect(results.violations).toEqual([]);
    });
  }
});
