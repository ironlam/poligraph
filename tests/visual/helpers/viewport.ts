import type { Page } from "@playwright/test";

/**
 * How far the page can actually be scrolled sideways.
 *
 * Not `documentElement.scrollWidth - clientWidth`: that value also counts content clipped by
 * `overflow: hidden` and content inside a legitimate horizontal scroller, so it reports an
 * overflow the visitor never experiences. Asking the browser to scroll and reading back where
 * it landed measures what a visitor gets.
 */
export async function horizontalScroll(page: Page): Promise<number> {
  return page.evaluate(() => {
    window.scrollTo(2000, 0);
    const x = window.scrollX;
    window.scrollTo(0, 0);
    return x;
  });
}
