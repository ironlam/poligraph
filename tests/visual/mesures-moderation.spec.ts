import AxeBuilder from "@axe-core/playwright";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { horizontalScroll } from "./helpers/viewport";
import { signSessionToken } from "../../src/lib/auth-token";

/**
 * Accessibility and responsive checks for the measure moderation screens.
 *
 * Needs the disposable container seeded with the demonstration corpus, and a dev server
 * pointed at it:
 *
 *   docker compose -f docker-compose.test-search.yml up -d
 *   export DATABASE_URL=postgresql://poligraph_test:poligraph_test@localhost:55433/poligraph_test?sslmode=disable
 *   npx prisma db push --url "$DATABASE_URL" --accept-data-loss
 *   npx tsx scripts/seed-measures-demo.ts
 *   node --env-file=.env node_modules/@playwright/test/cli.js test mesures-moderation --project=chromium
 *
 * Playwright loads the local, gitignored .env file before it starts the inherited dev server. The
 * session cookie is issued through the official signing primitive rather than through the login
 * form, so the test depends on the auth contract instead of on the markup of the login page.
 */

const SESSION_CONFIGURED =
  process.env.ADMIN_SESSION_SECRET &&
  process.env.ADMIN_SESSION_KEY_ID &&
  process.env.ADMIN_SESSION_EPOCH;
const WCAG = ["wcag2a", "wcag2aa", "wcag21aa"];

/**
 * Le document entier, plus aucun scope.
 *
 * La sidebar admin portait un échec de contraste AA que ces écrans héritaient sans l'introduire, donc
 * l'analyse était bornée à `#admin-main`. Corrigé par #648, vérifié sur le document complet de
 * /admin/mesures, /admin/policy-titles et /admin/promises : le scope n'a plus de raison d'être, et le
 * garder cacherait une régression future du layout.
 */

async function signIn(context: BrowserContext): Promise<void> {
  await context.addCookies([
    {
      name: "admin_session",
      value: signSessionToken(),
      domain: "localhost",
      path: "/",
    },
  ]);
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
  test.skip(!SESSION_CONFIGURED, "La configuration de session admin locale doit être définie");

  test.beforeEach(async ({ context }) => {
    await signIn(context);
  });

  test("la file rend le corpus de démonstration", async ({ page }) => {
    await page.goto("/admin/mesures");

    await expect(page.getByRole("heading", { name: "Mesures : relecture" })).toBeVisible();
    // Au moins les dix du corpus, et pas exactement dix : le parcours éditorial de ce fichier crée
    // ses propres mesures dans la même base, donc un compte absolu se casse tout seul.
    expect(await page.locator("tbody tr").count()).toBeGreaterThanOrEqual(10);
    // The state that must never be smoothed over.
    await expect(page.getByText("Publiée mais invisible du public").first()).toBeVisible();
    await expect(page.getByText("Retirée, source incomplète").first()).toBeVisible();
  });

  test("la file n'a aucune violation WCAG AA", async ({ page }) => {
    await page.goto("/admin/mesures");
    await expect(page.getByRole("table")).toBeVisible();

    const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();

    expect(results.violations).toEqual([]);
  });

  test("le détail n'a aucune violation WCAG AA", async ({ page }) => {
    await openFirstDetail(page);

    const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();

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

/**
 * The editorial journey through the interface.
 *
 * The integration suite already walks the transitions. This walks the SCREENS, which is the only way
 * to exercise the server actions in a real Next context: `revalidatePath` needs a request scope, so
 * it cannot be reached from vitest.
 */
test.describe("/admin/mesures — parcours éditorial", () => {
  // En série, et ce n'est pas un contournement de flake : ces tests écrivent dans la même base et
  // agissent sur le même serveur de dev. En parallèle (le défaut local, workers non borné), ils se
  // gênent et les échecs deviennent aléatoires.
  test.describe.configure({ mode: "serial" });

  test.skip(!SESSION_CONFIGURED, "La configuration de session admin locale doit être définie");

  test.beforeEach(async ({ context }) => {
    await signIn(context);
  });

  async function createMeasure(page: Page, text: string): Promise<void> {
    await page.goto("/admin/mesures/nouvelle");
    await page.getByLabel("Texte de la mesure").fill(text);
    await page.getByLabel("En vigueur à partir du").fill("2027-01-15");
    await page.getByLabel("URL").fill("https://example.org/programme-parcours.pdf");
    await page.getByLabel("Date de la source").fill("2027-01-15");
    await page.getByRole("button", { name: "Créer la mesure en brouillon" }).click();
    await expect(page).toHaveURL(/\/admin\/mesures\/[A-Za-z0-9]+$/);
  }

  test("crée, relit, publie, corrige, dépublie, republie et retire", async ({ page }) => {
    await createMeasure(page, "Parcours : encadrer les loyers dans les zones tendues.");

    // Brouillon : relire et abandonner, rien d'autre.
    await expect(page.getByRole("button", { name: "Marquer comme relue" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Publier cette version" })).toHaveCount(0);

    await page.getByRole("button", { name: "Marquer comme relue" }).click();
    await expect(page.getByRole("button", { name: "Publier cette version" })).toBeVisible();

    await page.getByRole("button", { name: "Publier cette version" }).click();
    // « Dépublier » n'est proposé QUE sur une mesure publiée : c'est la preuve non ambiguë que la
    // publication a eu lieu. getByText("Publiée") matcherait le libellé <dt>Publiée</dt> de la
    // chronologie, présent avant toute publication, et passerait donc à vide.
    await expect(page.getByRole("button", { name: "Dépublier" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Ce que le public voit" })).toBeVisible();
    await expect(page.getByText("1 source citée")).toBeVisible();

    // Correction : le texte public ne bouge pas tant qu'elle n'est pas publiée.
    await page.getByRole("button", { name: "Saisir une nouvelle révision" }).click();
    await page.getByLabel("Texte de la nouvelle révision").fill("Parcours : périmètre étendu.");
    await page.getByLabel("En vigueur à partir du").fill("2027-02-01");
    await page.getByLabel("URL").fill("https://example.org/correction-parcours");
    await page.getByLabel("Date de la source").fill("2027-02-01");
    await page.getByRole("button", { name: "Enregistrer le brouillon" }).click();

    await expect(page.getByText("Correction en cours")).toBeVisible();
    await page.getByRole("button", { name: "Marquer comme relue" }).click();
    await expect(page.getByText("Correction relue en attente")).toBeVisible();

    await page.getByRole("button", { name: "Publier cette correction" }).click();
    await expect(page.getByText("Parcours : périmètre étendu.").first()).toBeVisible();

    // Dépublication, motif exigé.
    await page.getByRole("button", { name: "Dépublier" }).click();
    await page.getByLabel("Motif de la dépublication").fill("Source contestée, à revérifier");
    await page.getByRole("button", { name: "Dépublier maintenant" }).click();
    await expect(page.getByText("Cette mesure ne sort d'aucune lecture publique.")).toBeVisible();

    // Republication depuis l'état rafraîchi.
    await page.getByRole("button", { name: "Publier cette correction" }).first().click();
    await expect(page.getByRole("button", { name: "Dépublier" })).toBeVisible();

    // Retrait du candidat : la mesure reste publique et porte son état de retrait.
    await page.getByRole("button", { name: "Enregistrer un retrait du candidat" }).click();
    await page.getByLabel("Date du retrait").fill("2027-03-01");
    await page.getByLabel("URL de la source").fill("https://example.org/retrait-parcours");
    await page.getByLabel("Libellé de la source").fill("Conférence de presse");
    await page.getByRole("button", { name: "Enregistrer le retrait" }).click();

    await expect(page.getByText("Retirée, sourcée")).toBeVisible();
    await expect(page.getByText(/Retirée le 1 mars 2027/)).toBeVisible();
    await expect(page.getByText(/ne réactive pas la proposition/)).toBeVisible();
  });

  test("explique un conflit de version au lieu de le présenter comme une faute de saisie", async ({
    context,
  }) => {
    const first = await context.newPage();
    await createMeasure(first, "Conflit : instaurer un revenu de base pour les 18-25 ans.");
    await first.getByRole("button", { name: "Marquer comme relue" }).click();
    await first.getByRole("button", { name: "Publier cette version" }).click();
    await expect(first.getByRole("button", { name: "Dépublier" })).toBeVisible();
    const url = first.url();

    // Deuxième onglet sur la même fiche : son jeton de version est celui de maintenant.
    const second = await context.newPage();
    await second.goto(url);
    await expect(second.getByRole("button", { name: "Dépublier" })).toBeVisible();

    // Le premier onglet agit, donc le jeton du second devient périmé.
    await first.getByRole("button", { name: "Dépublier" }).click();
    await first.getByLabel("Motif de la dépublication").fill("Retrait immédiat demandé");
    await first.getByRole("button", { name: "Dépublier maintenant" }).click();
    await expect(first.getByText("Cette mesure ne sort d'aucune lecture publique.")).toBeVisible();

    // Le second tente sa dépublication avec l'ancien jeton.
    await second.getByRole("button", { name: "Dépublier" }).click();
    await second.getByLabel("Motif de la dépublication").fill("Motif écrit avant");
    await second.getByRole("button", { name: "Dépublier maintenant" }).click();

    await expect(second.getByText("La fiche a changé")).toBeVisible();
    await expect(second.getByRole("button", { name: "Recharger la fiche" })).toBeVisible();
    // Et surtout : pas de « Action refusée », qui ferait chercher une faute de saisie.
    await expect(second.getByText("Action refusée")).toHaveCount(0);

    await first.close();
    await second.close();
  });

  test("l'écran de création n'a aucune violation WCAG AA", async ({ page }) => {
    await page.goto("/admin/mesures/nouvelle");
    await expect(page.getByRole("heading", { name: "Nouvelle mesure" })).toBeVisible();

    const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();

    expect(results.violations).toEqual([]);
  });

  test("la fiche avec ses actions et ses formulaires n'a aucune violation WCAG AA", async ({
    page,
  }) => {
    await createMeasure(page, "Accessibilité : doubler le budget de la rénovation énergétique.");
    // Formulaires ouverts : c'est dans cet état que les champs et leurs libellés existent.
    await page.getByRole("button", { name: "Ajouter une qualification" }).click();

    const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();

    expect(results.violations).toEqual([]);
  });

  for (const [label, width, height] of [
    ["mobile", 375, 812],
    ["tablette", 768, 1024],
    ["bureau", 1440, 900],
  ] as const) {
    test(`les actions restent lisibles en ${label} sans sept formulaires ouverts`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await createMeasure(page, `Responsive ${label} : encadrer les loyers.`);
      await page.getByRole("button", { name: "Marquer comme relue" }).click();
      await page.getByRole("button", { name: "Publier cette version" }).click();
      await expect(page.getByRole("button", { name: "Dépublier" })).toBeVisible();

      // Aucun formulaire n'est ouvert par défaut.
      await expect(page.getByLabel("Motif de la dépublication")).toHaveCount(0);
      await expect(page.getByLabel("Texte de la nouvelle révision")).toHaveCount(0);

      // Un seul à la fois : ouvrir le second ferme le premier.
      await page.getByRole("button", { name: "Dépublier" }).click();
      await expect(page.getByLabel("Motif de la dépublication")).toBeVisible();
      await page.getByRole("button", { name: "Saisir une nouvelle révision" }).click();
      await expect(page.getByLabel("Texte de la nouvelle révision")).toBeVisible();
      await expect(page.getByLabel("Motif de la dépublication")).toHaveCount(0);

      expect(await horizontalScroll(page)).toBe(0);

      await page.screenshot({
        path: `tests/visual/test-results/mesures-actions-${label}.png`,
        fullPage: true,
      });
    });
  }
});
