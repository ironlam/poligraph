/**
 * Anchor shared by the profile tabs and the shortcuts that open them.
 *
 * The "En bref" shortcuts change the active tab through `?tab=`, but on mobile
 * they render above the tabs, so the panel they open is off screen and the
 * click looks like a no-op. Both sides agree on this id so a shortcut can bring
 * the tabs into view. It lives on `ProfileTabs`, mounted once, never on the
 * summary, which is mounted twice.
 */
export const PROFILE_TABS_ANCHOR_ID = "fiche-onglets";

export function revealProfileTabs() {
  const anchor = document.getElementById(PROFILE_TABS_ANCHOR_ID);
  if (!anchor) return;

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  anchor.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  // Keyboard and screen reader users follow the same path as the pointer. The
  // scroll above already did the moving, so focus must not redo it.
  anchor.focus({ preventScroll: true });
}
