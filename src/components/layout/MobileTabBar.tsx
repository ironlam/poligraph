"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Landmark, Menu, Scale, Users, Vote } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { NAV_TABS, getActiveTabHref, type TabIcon } from "@/config/navigation";
import { cn } from "@/lib/utils";
import { useMobileMenu } from "./MobileMenuProvider";

const TAB_ICONS: Record<TabIcon, LucideIcon> = {
  users: Users,
  landmark: Landmark,
  scale: Scale,
  vote: Vote,
};

const TAB_CLASS =
  "flex h-full w-full flex-col items-center justify-center gap-1 text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";
const TAB_IDLE_CLASS = "text-muted-foreground-strong hover:text-foreground";
// The bar on top doubles the colour: the active tab is never told by hue alone.
const TAB_ACTIVE_CLASS = "font-bold text-primary shadow-[inset_0_3px_0_var(--primary)]";

/**
 * Bottom tab bar, below `lg` only: the four sections a mobile reader reaches most, plus the menu.
 *
 * The tabs are plain links to existing pages, so the bar adds no route. The fifth one is a button:
 * it opens the same overlay the header burger used to open.
 */
export function MobileTabBar() {
  const pathname = usePathname();
  const { isOpen, setIsOpen, triggerRef } = useMobileMenu();

  // The admin console has its own navigation.
  if (pathname.startsWith("/admin")) return null;

  const activeHref = getActiveTabHref(pathname);

  return (
    <>
      {/* Keeps the end of the page clear of the fixed bar. */}
      <div aria-hidden="true" className="h-[var(--tabbar-h)] shrink-0 print:hidden" />
      <nav
        aria-label="Navigation rapide"
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-background pb-[env(safe-area-inset-bottom)] lg:hidden print:hidden"
      >
        <ul className="grid h-16 grid-cols-5">
          {NAV_TABS.map((tab) => {
            const Icon = TAB_ICONS[tab.icon];
            const isActive = tab.href === activeHref;
            return (
              <li key={tab.href}>
                <Link
                  href={tab.href}
                  prefetch={false}
                  aria-label={tab.ariaLabel}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(TAB_CLASS, isActive ? TAB_ACTIVE_CLASS : TAB_IDLE_CLASS)}
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                  <span>{tab.label}</span>
                </Link>
              </li>
            );
          })}
          <li>
            <button
              ref={triggerRef}
              type="button"
              onClick={() => setIsOpen((open) => !open)}
              aria-label={isOpen ? "Fermer le menu" : "Ouvrir le menu"}
              aria-expanded={isOpen}
              aria-controls="mobile-menu"
              aria-haspopup="dialog"
              className={cn(TAB_CLASS, isOpen ? TAB_ACTIVE_CLASS : TAB_IDLE_CLASS)}
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
              <span>Menu</span>
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}
