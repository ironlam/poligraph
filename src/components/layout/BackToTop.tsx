"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ArrowUp } from "lucide-react";

/** Screens scrolled before the button shows: a short page never needs it. */
const SCREENS_BEFORE_SHOWING = 1.5;

/**
 * Floating "back to top" button. Many pages run long (vote lists, candidate fiches, the hub), and
 * on a phone the only way back to the search and the tabs was to scroll all the way up.
 *
 * It sits above the bottom tab bar, on the right. `raised` lifts it over whatever already occupies
 * that corner: the chat widget when it is enabled, and the action bar of an affair page.
 */
export function BackToTop({ raised = false }: { raised?: boolean }) {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      setVisible(window.scrollY > window.innerHeight * SCREENS_BEFORE_SHOWING);
    };
    const onScroll = () => {
      if (frame === 0) frame = window.requestAnimationFrame(update);
    };
    // Through the frame, not directly: a restored scroll position still shows the button.
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame !== 0) window.cancelAnimationFrame(frame);
    };
  }, [pathname]);

  // The admin console has its own navigation.
  if (pathname.startsWith("/admin") || !visible) return null;

  const lifted = raised || pathname.startsWith("/affaires/");

  return (
    <button
      type="button"
      aria-label="Revenir en haut de la page"
      title="Revenir en haut de la page"
      onClick={() => {
        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
        // The button is about to disappear: hand focus to the page content rather than lose it.
        document.getElementById("main-content")?.focus({ preventScroll: true });
      }}
      className={`fixed right-4 z-40 flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-md transition-colors hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none print:hidden ${
        lifted ? "bottom-[calc(var(--tabbar-h)+5.5rem)]" : "bottom-[calc(var(--tabbar-h)+1rem)]"
      }`}
    >
      <ArrowUp aria-hidden="true" className="h-5 w-5" />
    </button>
  );
}
