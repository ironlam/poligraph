"use client";

import { useEffect } from "react";

const HIGHLIGHT_CLASS = "cite-target";
const HIGHLIGHT_MS = 2500;
const WAIT_MS = 2000;

/**
 * Watches the URL hash and, once the target element is mounted (a Radix tab may
 * need to activate first), scrolls to it, moves focus for screen readers and
 * flashes a temporary highlight. Client-only; no server hash/query read (ISR-safe).
 */
export function DeepLinkHighlighter() {
  useEffect(() => {
    let observer: MutationObserver | null = null;
    let highlightTimer: ReturnType<typeof setTimeout> | null = null;
    let waitTimer: ReturnType<typeof setTimeout> | null = null;

    const reduceMotion =
      typeof window !== "undefined" &&
      !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    function reveal(id: string): boolean {
      const el = document.getElementById(id);
      if (!el) return false;
      el.scrollIntoView({ block: "center", behavior: reduceMotion ? "auto" : "smooth" });
      el.setAttribute("tabindex", "-1");
      el.focus({ preventScroll: true });
      el.classList.add(HIGHLIGHT_CLASS);
      highlightTimer = setTimeout(() => el.classList.remove(HIGHLIGHT_CLASS), HIGHLIGHT_MS);
      return true;
    }

    function stopWaiting() {
      observer?.disconnect();
      observer = null;
      if (waitTimer) {
        clearTimeout(waitTimer);
        waitTimer = null;
      }
    }

    function handle() {
      stopWaiting();
      const id = window.location.hash.slice(1);
      if (!id) return;
      if (reveal(id)) return;
      // Target not mounted yet (tab activating). Wait for it to appear.
      observer = new MutationObserver(() => {
        if (reveal(id)) stopWaiting();
      });
      observer.observe(document.body, { childList: true, subtree: true });
      waitTimer = setTimeout(stopWaiting, WAIT_MS);
    }

    handle();
    window.addEventListener("hashchange", handle);
    return () => {
      window.removeEventListener("hashchange", handle);
      stopWaiting();
      if (highlightTimer) clearTimeout(highlightTimer);
    };
  }, []);

  return null;
}
