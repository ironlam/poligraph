"use client";

import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { clearReturnEntry, readReturnEntry, writeReturnEntry } from "./return-entry";

/**
 * Link to a profile that remembers where the reader came from, so the profile can offer
 * « Retour à … ». The link works without storage or without JavaScript.
 */
export function RememberReturn({
  targetSlug,
  returnUrl,
  label,
  className,
  children,
}: {
  targetSlug: string;
  returnUrl: string;
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={`/politiques/${targetSlug}`}
      className={className}
      onClick={() =>
        writeReturnEntry({
          targetSlug,
          returnUrl,
          label,
          scrollY: window.scrollY,
          createdAt: Date.now(),
        })
      }
    >
      {children}
    </Link>
  );
}

/**
 * Placed on the origin page: when the stored entry points back to this very URL, restore the
 * scroll position once, then forget the entry.
 */
export function ReturnScrollRestorer() {
  useEffect(() => {
    const entry = readReturnEntry();
    if (!entry) return;
    const here = `${window.location.pathname}${window.location.search}`;
    if (entry.returnUrl !== here) return;
    clearReturnEntry();
    window.requestAnimationFrame(() => window.scrollTo(0, entry.scrollY));
  }, []);
  return null;
}
