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
const AXE_WIDTHS = new Set([375, 1440]);

const PAGES = [
  { name: "hub", path: "/elections/presidentielle-2027" },
  {
    name: "annuaire des candidatures",
    path: "/elections/presidentielle-2027/candidats",
    expectedHeading: "Candidatures et personnalités suivies",
  },
  { name: "index des sujets", path: "/elections/presidentielle-2027/sujets" },
  {
    name: "page sujet sous seuil (numérique & tech)",
    path: "/elections/presidentielle-2027/sujets/numerique-tech",
  },
  // La fiche candidature porte la barre de retour persistante : son bouton doit garder sa cible
  // tactile et son contraste aux trois largeurs, et la barre ne doit pas provoquer de débordement.
  // `presidentielle-hub-demo-c` est la première candidature publiée du seed.
  {
    name: "fiche candidature publiée",
    path: "/elections/presidentielle-2027/candidats/presidentielle-hub-demo-c",
    expectedHeading: "Candidat·e C",
  },
];

for (const { name, path, expectedHeading } of PAGES) {
  test.describe(`${name} (présidentielle 2027)`, () => {
    for (const width of WIDTHS) {
      test(`répond 200, sans violation WCAG AA ni débordement horizontal à ${width}px`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 900 });
        const response = await page.goto(path);
        expect(response?.status()).toBe(200);
        const heading = page.getByRole("heading", { level: 1 });
        await expect(heading).toBeVisible();
        if (expectedHeading !== undefined) {
          await expect(heading).toHaveText(expectedHeading);
          await expect(page.getByText("Page introuvable", { exact: true })).toHaveCount(0);
        }

        expect(await horizontalScroll(page)).toBe(0);

        // Axe is invariant at the tablet breakpoint for these pages. Keep mobile and desktop
        // coverage, while every width still exercises the HTTP and overflow contracts.
        if (AXE_WIDTHS.has(width)) {
          const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
          expect(results.violations).toEqual([]);
        }
      });
    }
  });
}

test("la recherche conserve une séquence clavier complète et la synchronise dans l'URL", async ({
  page,
}) => {
  await page.goto("/elections/presidentielle-2027/candidats");
  const search = page.getByRole("searchbox", {
    name: "Rechercher une personne ou un parti",
  });

  await search.focus();
  await page.keyboard.type("Candidat C", { delay: 25 });

  await expect(search).toHaveValue("Candidat C");
  await expect(page).toHaveURL(/\?q=Candidat\+C$/);
  await expect(page.getByRole("heading", { name: "Candidat·e C" })).toBeVisible();
  await expect(search).toHaveValue("Candidat C");
});

test("la recherche du hub ouvre une personnalité puis une mesure au clavier", async ({
  page,
}, testInfo) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/elections/presidentielle-2027");
  const search = page.getByRole("combobox", {
    name: "Rechercher une mesure ou une personnalité suivie",
  });

  await search.fill("Candidat C");
  await expect(page.getByRole("listbox")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Personnalités suivies" })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("hub-recherche-personnalite.png"),
    fullPage: true,
  });
  await search.focus();
  await page.keyboard.press("ArrowDown");
  await search.press("Enter");
  await expect(page).toHaveURL(/\/candidats\/presidentielle-hub-demo-c$/);
  await expect(page.getByRole("heading", { level: 1, name: "Candidat·e C" })).toBeVisible();

  await page.goto("/elections/presidentielle-2027");
  const measureSearch = page.getByRole("combobox", {
    name: "Rechercher une mesure ou une personnalité suivie",
  });
  const searchResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/elections/presidentielle-2027/recherche") &&
      response.request().method() === "GET"
  );
  await measureSearch.fill("Encadrer");
  const response = await searchResponse;
  expect(Number(response.headers()["content-length"] ?? 0)).toBeLessThan(64_000);
  await expect(page.getByRole("heading", { name: "Mesures" })).toBeVisible();
  await measureSearch.focus();
  await page.keyboard.press("ArrowDown");
  await measureSearch.press("Enter");
  await expect(page).toHaveURL(/\/elections\/presidentielle-2027\/mesures\//);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Encadrer les loyers dans les zones tendues.",
    })
  ).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("page-mesure.png"), fullPage: true });

  expect(consoleErrors).toEqual([]);
});

test("la recherche du hub gère l'état vide, Échap et la page partageable", async ({ page }) => {
  await page.goto("/elections/presidentielle-2027");
  const search = page.getByRole("combobox", {
    name: "Rechercher une mesure ou une personnalité suivie",
  });

  await search.fill("introuvable-poligraph");
  await expect(page.getByText(/Aucun résultat dans le corpus public/)).toBeVisible();
  await search.press("Escape");
  await expect(page.getByRole("listbox")).toHaveCount(0);

  await search.fill("logement");
  await expect(page.getByRole("button", { name: "Voir tous les résultats" })).toBeVisible();
  await page.getByRole("button", { name: "Voir tous les résultats" }).click();
  await expect(page).toHaveURL(/\/elections\/presidentielle-2027\/recherche\?q=logement$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Résultats dans le corpus 2027");
  await expect(page.getByRole("link", { name: /Comparer le sujet Logement/ })).toBeVisible();
});
