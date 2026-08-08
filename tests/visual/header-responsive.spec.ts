import { expect, test, type Page } from "@playwright/test";
import { horizontalScroll } from "./helpers/viewport";

/**
 * Guards the global header across the two breakpoints where its layout changes regime.
 *
 * The defect this spec was written for: at exactly 1024px the whole desktop navigation appeared at
 * once next to a search trigger carrying `min-w-[200px]`, and the document overflowed by 100px. The
 * existing guards sampled 375 / 768 / 1440 and stepped straight over it.
 *
 * The header is global, so `/` is only a witness page: any page would show the same defect. It is
 * public and read-only, so no session is forged and no fixture is needed — a dev server serving the
 * homepage is enough:
 *
 *   npm run dev
 *   npx playwright test header-responsive --project=chromium
 *
 * Precondition: the three flags that widen the header (`STATISTIQUES_SECTION`, `PROGRAMMES_ENABLED`,
 * `BOUSSOLE_ENABLED`) must be enabled on the database behind that server. They add two labelled links
 * and one icon, so they produce the widest header — the only configuration where this guard means
 * anything. The destinations assertion below fails loudly rather than passing on a narrower header.
 *
 * On a disposable database, `tests/visual/fixtures/header-flags.sql` sets them. That is what the
 * `header-responsive` CI job runs, so a local reproduction and the pipeline read the same header.
 */

/** Tailwind `lg` is 1024 and `xl` is 1280. Each is tested one pixel below and at the boundary. */
const BREAKPOINT_WIDTHS = [1023, 1024, 1279, 1280] as const;

const THEMES = ["light", "dark"] as const;

const PRIMARY_DESTINATIONS = [
  { href: "/statistiques", label: "Statistiques" },
  { href: "/politiques", label: "Politiques" },
  { href: "/affaires", label: "Affaires" },
  { href: "/programmes", label: "Programmes" },
  { href: "/parlement", label: "Parlement" },
];

const MOBILE_MENU = '[role="dialog"][aria-label="Menu de navigation"]';

type Regime = "mobile" | "desktop-compact" | "desktop-full";

function regimeFor(width: number): Regime {
  if (width < 1024) return "mobile";
  return width < 1280 ? "desktop-compact" : "desktop-full";
}

/**
 * Every header descendant whose box crosses a viewport edge.
 *
 * Complements the scroll measurement rather than repeating it: a sticky, clipped or
 * `overflow: hidden` ancestor can swallow the page scroll while children still sit outside the
 * viewport, which is a visual defect the scroll number alone reports as clean.
 */
async function headerElementsOutsideViewport(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const header = document.querySelector('header[role="banner"]');
    if (!header) throw new Error('header[role="banner"] est introuvable');

    const viewport = document.documentElement.clientWidth;
    const escaped: string[] = [];

    for (const element of header.querySelectorAll("*")) {
      const box = element.getBoundingClientRect();

      // Collapsed box: the element is not rendered at this width.
      if (box.width === 0 && box.height === 0) continue;

      // Screen-reader-only text is a 1px absolutely positioned box by design, and it is allowed to
      // sit off-screen. It is never a visual overflow.
      const style = getComputedStyle(element);
      if (style.position === "absolute" && box.width <= 1 && box.height <= 1) continue;

      // Half a pixel of tolerance: subpixel layout rounds boxes past an integer edge.
      if (box.right > viewport + 0.5 || box.left < -0.5) {
        // `getAttribute`, not `className`: on an SVG element the latter is an SVGAnimatedString
        // and stringifies to "[object SVGAnimatedString]", which tells the reader nothing.
        const classes = (element.getAttribute("class") ?? "")
          .trim()
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 3)
          .join(".");
        escaped.push(
          `<${element.tagName.toLowerCase()}${classes ? "." + classes : ""}> ` +
            `left=${Math.round(box.left)} right=${Math.round(box.right)} (viewport ${viewport})`
        );
      }
    }

    return escaped;
  });
}

for (const theme of THEMES) {
  for (const width of BREAKPOINT_WIDTHS) {
    const regime = regimeFor(width);

    test.describe(`en-tête à ${width}px, thème ${theme === "dark" ? "sombre" : "clair"}`, () => {
      test.beforeEach(async ({ page }) => {
        await page.emulateMedia({ colorScheme: theme });
        await page.setViewportSize({ width, height: 900 });
        await page.goto("/");
        await expect(page.locator('header[role="banner"]')).toBeVisible();

        // The theme is applied by next-themes from `prefers-color-scheme`, asynchronously after
        // hydration. Asserting the class is what makes "verified in dark theme" a fact rather than
        // a claim: without it, both runs could silently exercise the light theme.
        await expect
          .poll(() => page.evaluate(() => document.documentElement.classList.contains("dark")))
          .toBe(theme === "dark");
      });

      test("ne laisse aucun défilement horizontal", async ({ page }) => {
        expect(await horizontalScroll(page)).toBe(0);
      });

      test("ne laisse aucun élément hors du viewport", async ({ page }) => {
        expect(await headerElementsOutsideViewport(page)).toEqual([]);
      });

      test("garde les cinq destinations principales atteignables, libellés compris", async ({
        page,
      }) => {
        if (regime === "mobile") {
          await page.getByRole("button", { name: "Ouvrir le menu" }).click();
          await expect(page.locator(MOBILE_MENU)).toBeVisible();
        }

        // The mobile menu is portalled out of the header, so the scope follows the regime.
        const scope = regime === "mobile" ? page.locator(MOBILE_MENU) : page.locator("header");

        for (const { href, label } of PRIMARY_DESTINATIONS) {
          const link = scope.locator(`a[href="${href}"]`).first();
          await expect(link, `destination ${href} absente à ${width}px`).toBeVisible();
          await expect(link, `destination ${href} sans libellé à ${width}px`).toContainText(label);
        }
      });

      test("garde recherche, thème et Boussole atteignables", async ({ page }) => {
        if (regime === "mobile") {
          // Search sits in the header bar; theme and Boussole live inside the menu.
          //
          // `:visible` is required, not cosmetic: two buttons carry the accessible name
          // "Rechercher" in the header, and here one of them is hidden by an ancestor rather than
          // by itself. Without it Playwright reports a strict mode violation at this width.
          await expect(
            page.locator('header button[aria-label="Rechercher"]:visible')
          ).toBeVisible();
          await page.getByRole("button", { name: "Ouvrir le menu" }).click();
          await expect(page.locator(MOBILE_MENU)).toBeVisible();
        }

        const scope = regime === "mobile" ? page.locator(MOBILE_MENU) : page.locator("header");

        await expect(
          scope.getByRole("button", { name: /Changer le thème|Passer en mode/ })
        ).toBeVisible();
        await expect(scope.getByRole("link", { name: /^Boussole politique/ })).toBeVisible();
      });

      test("n'expose qu'un seul contrôle de recherche", async ({ page }) => {
        // The regression this encodes: the compact trigger used to carry `lg:hidden` inside a
        // `hidden lg:flex` nav, so it was visible at no width at all. A count of exactly one
        // catches both that disappearance and the duplicate the fix could have introduced.
        const searchControls = page.locator('header button[aria-label^="Rechercher"]:visible');
        await expect(searchControls).toHaveCount(1);

        const fullTrigger = page.locator('header button[aria-label="Rechercher (Cmd+K)"]');
        if (regime === "desktop-full") {
          await expect(fullTrigger).toBeVisible();
        } else {
          await expect(fullTrigger).toBeHidden();
        }
      });
    });
  }
}
