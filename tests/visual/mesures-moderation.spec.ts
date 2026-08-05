import { createHmac } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

/**
 * Accessibility and responsive checks for the measure moderation screens.
 *
 * Needs the disposable container seeded with the demonstration corpus, and a dev server
 * pointed at it:
 *
 *   docker compose -f docker-compose.test-search.yml up -d
 *   DATABASE_URL=postgresql://poligraph_test:poligraph_test@localhost:55433/poligraph_test?sslmode=disable \
 *     npx prisma db push --url "$DATABASE_URL" --accept-data-loss
 *   DATABASE_URL=... npx tsx scripts/seed-measures-demo.ts
 *   DATABASE_URL=... ADMIN_PASSWORD=<choix local> npm run dev
 *   ADMIN_PASSWORD=<le même> npx playwright test mesures-moderation --project=chromium
 *
 * The session cookie is forged rather than typed into the login form: it is the exact token
 * `isAuthenticated()` verifies, so the test depends on the auth contract instead of on the
 * markup of the login page.
 */

const PASSWORD = process.env.ADMIN_PASSWORD;
const WCAG = ["wcag2a", "wcag2aa", "wcag21aa"];

/**
 * The scan is scoped to the page content, not the whole document.
 *
 * The admin sidebar carries one WCAG AA contrast failure (#6e7174 on #0d1218, 3.82:1 in the
 * section labels), verified identical on /admin/policy-titles, /admin/promises and
 * /admin/affaires. It is layout debt these screens inherit, not something they introduce, and
 * it is tracked separately. Scoping states what this suite is responsible for instead of
 * silencing a rule.
 */
const CONTENT = "#admin-main";

async function signIn(context: BrowserContext, password: string): Promise<void> {
  const timestamp = Date.now();
  const signature = createHmac("sha256", password).update(String(timestamp)).digest("hex");
  await context.addCookies([
    {
      name: "admin_session",
      value: `${timestamp}.${signature}`,
      domain: "localhost",
      path: "/",
    },
  ]);
}

/**
 * How far the PAGE can actually be scrolled sideways.
 *
 * Not `documentElement.scrollWidth - clientWidth`: that value also counts content clipped by
 * `overflow: hidden` and content inside a legitimate horizontal scroller, so it reports an
 * overflow the visitor never experiences. Asking the browser to scroll and reading back where
 * it landed measures what a visitor gets.
 */
async function horizontalScroll(page: Page): Promise<number> {
  return page.evaluate(() => {
    window.scrollTo(2000, 0);
    const x = window.scrollX;
    window.scrollTo(0, 0);
    return x;
  });
}

/**
 * Opens the first measure of the filtered queue and waits for the URL to change.
 *
 * The URL assertion is the point: the queue and the detail both have an h1, so waiting on a
 * level-1 heading let two tests run against the queue while claiming to test the detail.
 */
async function openFirstDetail(page: Page): Promise<void> {
  await page.goto("/admin/mesures?anomalies=1");
  await page.getByRole("link", { name: "Examiner" }).first().click();
  await expect(page).toHaveURL(/\/admin\/mesures\/[A-Za-z0-9]+$/);
  await expect(page.getByRole("link", { name: "Retour à la file" })).toBeVisible();
}

test.describe("/admin/mesures — modération des mesures", () => {
  test.skip(!PASSWORD, "ADMIN_PASSWORD doit valoir le mot de passe du serveur de dev local");

  test.beforeEach(async ({ context }) => {
    await signIn(context, PASSWORD as string);
  });

  test("la file rend le corpus de démonstration", async ({ page }) => {
    await page.goto("/admin/mesures");

    await expect(page.getByRole("heading", { name: "Mesures : relecture" })).toBeVisible();
    // Ten measures in the corpus, so ten rows plus the header row.
    await expect(page.locator("tbody tr")).toHaveCount(10);
    // The state that must never be smoothed over.
    await expect(page.getByText("Publiée mais invisible du public").first()).toBeVisible();
    await expect(page.getByText("Retirée, source incomplète").first()).toBeVisible();
  });

  test("la file n'a aucune violation WCAG AA", async ({ page }) => {
    await page.goto("/admin/mesures");
    await expect(page.getByRole("table")).toBeVisible();

    const results = await new AxeBuilder({ page }).include(CONTENT).withTags(WCAG).analyze();

    expect(results.violations).toEqual([]);
  });

  test("le détail n'a aucune violation WCAG AA", async ({ page }) => {
    await openFirstDetail(page);

    const results = await new AxeBuilder({ page }).include(CONTENT).withTags(WCAG).analyze();

    expect(results.violations).toEqual([]);
  });

  test("le détail montre les raisons quand le public ne voit rien", async ({ page }) => {
    await openFirstDetail(page);

    await expect(page.getByRole("heading", { name: "Ce que le public voit" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Anomalies" })).toBeVisible();
  });

  for (const [label, width, height] of [
    ["mobile", 375, 812],
    ["tablette", 768, 1024],
    ["bureau", 1440, 900],
  ] as const) {
    test(`la file ne fait pas défiler la page horizontalement en ${label}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto("/admin/mesures");
      await expect(page.getByRole("table")).toBeVisible();

      // The table scrolls inside its own container; the page must not.
      expect(await horizontalScroll(page)).toBe(0);

      await page.screenshot({
        path: `tests/visual/test-results/mesures-file-${label}.png`,
        fullPage: true,
      });
    });

    test(`le détail ne fait pas défiler la page horizontalement en ${label}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await openFirstDetail(page);

      expect(await horizontalScroll(page)).toBe(0);

      await page.screenshot({
        path: `tests/visual/test-results/mesures-detail-${label}.png`,
        fullPage: true,
      });
    });
  }
});
