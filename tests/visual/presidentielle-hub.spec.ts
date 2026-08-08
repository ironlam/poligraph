import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { horizontalScroll } from "./helpers/viewport";

/**
 * Accessibility and responsive checks for the public presidential hub, its themes index, and one
 * subject page below the publication gate.
 *
 * Needs the disposable container seeded with the fictional hub fixtures, and a dev server pointed
 * at it (never production: `.env` and `.env.prod` share the same Supabase database):
 *
 *   docker compose -f docker-compose.test-search.yml up -d
 *   DATABASE_URL=postgresql://poligraph_test:poligraph_test@localhost:55433/poligraph_test?sslmode=disable \
 *     npx prisma db push --url "$DATABASE_URL" --accept-data-loss
 *   DATABASE_URL=... npx tsx scripts/seed-presidentielle-hub-demo.ts
 *   DATABASE_URL=... npm run dev
 *   npx playwright test presidentielle-hub --project=chromium
 *
 * Every page is public, so no session is forged: each is read exactly as a visitor sees it.
 */

const WCAG = ["wcag2a", "wcag2aa", "wcag21aa"];
const WIDTHS = [375, 768, 1440];

const PAGES = [
  { name: "hub", path: "/elections/presidentielle-2027" },
  { name: "index des sujets", path: "/elections/presidentielle-2027/sujets" },
  {
    name: "page sujet sous seuil (numérique & tech)",
    path: "/elections/presidentielle-2027/sujets/numerique-tech",
  },
];

for (const { name, path } of PAGES) {
  test.describe(`${name} (présidentielle 2027)`, () => {
    for (const width of WIDTHS) {
      test(`répond 200, sans violation WCAG AA ni débordement horizontal à ${width}px`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 900 });
        const response = await page.goto(path);
        expect(response?.status()).toBe(200);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

        expect(await horizontalScroll(page)).toBe(0);

        const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
        expect(results.violations).toEqual([]);
      });
    }
  });
}
