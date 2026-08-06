"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { revealProfileTabs } from "./profile-tabs-anchor";

/**
 * Shortcut to one of the profile tabs. Selecting the tab is the job of `?tab=`
 * in the href; this only makes sure the visitor ends up looking at the panel
 * that just opened, which `scroll={false}` alone never did.
 */
export function TabShortcutLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  // A few shortcuts point at an in-page anchor (#dossiers) instead of a tab.
  // The browser already scrolls those, and revealing the tabs would fight it.
  const opensTab = /[?&]tab=/.test(href);

  return (
    <Link
      href={href}
      prefetch={false}
      scroll={false}
      className={className}
      onClick={opensTab ? () => revealProfileTabs() : undefined}
    >
      {children}
    </Link>
  );
}
