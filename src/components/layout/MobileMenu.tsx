"use client";

import { useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCommandPalette } from "@/components/search";
import { MobileThemeToggle } from "@/components/theme/MobileThemeToggle";
import { PageShareButton } from "@/components/ui/PageShareButton";
import {
  NAV_ELECTIONS,
  NAV_MENU_GROUPS,
  filterNavGroups,
  type NavGroup,
} from "@/config/navigation";
import {
  Vote,
  Landmark,
  MapPin,
  Search,
  X,
  ChevronRight,
  Heart,
  Compass,
  MessageSquareWarning,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Logo } from "./Logo";
import { useMobileMenu } from "./MobileMenuProvider";

// Icons of the elections block, the only entries of the menu that carry one.
const ICON_MAP: Record<string, LucideIcon> = {
  vote: Vote,
  landmark: Landmark,
  mapPin: MapPin,
};

const GROUP_TITLE_CLASS = "mb-2 text-[13px] font-bold text-muted-foreground-strong";

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  );
}

interface MobileMenuProps {
  enabledFlags: string[];
  /** Slugs of the NAV_ELECTIONS whose ballot has been held, resolved server-side */
  pastElectionSlugs: string[];
  /** Slug of the election put forward (ELECTION_SPOTLIGHT), already validated server-side */
  spotlightSlug?: string | null;
}

export function MobileMenu({
  enabledFlags,
  pastElectionSlugs,
  spotlightSlug = null,
}: MobileMenuProps) {
  // Opened from the bottom tab bar, which sits outside of the header this component renders in.
  const { isOpen, setIsOpen, triggerRef } = useMobileMenu();
  const menuRef = useRef<HTMLDivElement>(null);
  const searchFieldRef = useRef<HTMLButtonElement>(null);
  // Set when the search screen hands back to the menu, so focus lands where the reader left.
  const returnToSearchFieldRef = useRef(false);
  const pathname = usePathname();
  const { open: openPalette, openWithBack: openPaletteWithBack } = useCommandPalette();
  const flagSet = new Set(enabledFlags);

  // "Mes outils" closes the menu, after the elections; the other groups open it.
  const groups = filterNavGroups(NAV_MENU_GROUPS, flagSet);
  const primaryGroups = groups.slice(0, -1);
  const toolGroups = groups.slice(-1);
  // The election put forward first, then upcoming, then held ones, each keeping its NAV_ELECTIONS
  // order. The spotlight slug only reorders: an election hidden by its own flag stays hidden.
  const pastSlugs = new Set(pastElectionSlugs);
  const filteredElections = NAV_ELECTIONS.filter(
    (item) => !item.featureFlag || flagSet.has(item.featureFlag)
  ).sort(
    (a, b) =>
      Number(b.slug === spotlightSlug) - Number(a.slug === spotlightSlug) ||
      Number(pastSlugs.has(a.slug)) - Number(pastSlugs.has(b.slug))
  );

  const openSearchScreen = () => {
    // The menu steps aside rather than stacking under the search screen; leaving that screen
    // without choosing a result brings it back.
    setIsOpen(false);
    openPaletteWithBack(() => {
      returnToSearchFieldRef.current = true;
      // Deferred: when Escape closes the search screen, reopening synchronously would attach the
      // menu's own Escape listener while that same key event is still dispatching, and close it.
      setTimeout(() => setIsOpen(true), 0);
    });
  };

  const close = useCallback(() => {
    setIsOpen(false);
    triggerRef.current?.focus();
  }, [setIsOpen, triggerRef]);

  // Keyboard handling
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        return;
      }

      // Focus trap
      if (e.key === "Tab" && menuRef.current) {
        const focusable = getFocusableElements(menuRef.current);
        if (focusable.length === 0) return;

        const first = focusable[0]!;
        const last = focusable[focusable.length - 1]!;

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, close]);

  // Focus first element on open, or the search field when returning from the search screen
  useEffect(() => {
    if (isOpen && menuRef.current) {
      if (returnToSearchFieldRef.current && searchFieldRef.current) {
        returnToSearchFieldRef.current = false;
        searchFieldRef.current.focus();
        return;
      }
      const focusable = getFocusableElements(menuRef.current);
      focusable[0]?.focus();
    }
  }, [isOpen]);

  // Close on route change
  useEffect(() => {
    setIsOpen(false);
  }, [pathname, setIsOpen]);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const renderGroup = (group: NavGroup, index: number) => {
    const titleId = `mobile-menu-group-${group.label.replace(/\W+/g, "-").toLowerCase()}`;
    return (
      <section
        key={group.label}
        aria-labelledby={titleId}
        className={index > 0 ? "mt-6" : undefined}
      >
        <h2 id={titleId} className={GROUP_TITLE_CLASS}>
          {group.label}
        </h2>
        <ul className="grid grid-cols-2 gap-2">
          {group.items.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={close}
                  aria-current={isActive ? "page" : undefined}
                  className={`flex min-h-12 items-center rounded-xl border px-3 py-2 font-display text-[15px] font-bold leading-tight transition-colors ${
                    isActive ? "bg-muted text-foreground" : "bg-card text-foreground hover:bg-muted"
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    );
  };

  return (
    <>
      {/* Mobile header icons - visible only on <lg */}
      <div className="flex lg:hidden items-center gap-2">
        {/* Search */}
        <button
          type="button"
          onClick={openPalette}
          className="flex items-center justify-center h-10 w-10 rounded-lg text-foreground/70 hover:text-foreground hover:bg-muted/50 transition-colors"
          aria-label="Rechercher"
        >
          <Search className="h-5 w-5" />
        </button>

        <PageShareButton />
      </div>

      {/* Full-screen menu overlay — portaled to body to escape header's backdrop-filter containing block */}
      {isOpen &&
        createPortal(
          <div
            ref={menuRef}
            id="mobile-menu"
            role="dialog"
            aria-modal="true"
            aria-label="Menu de navigation"
            className="fixed inset-0 z-[60] bg-background text-foreground flex flex-col"
          >
            {/* Menu header */}
            <div className="flex items-center justify-between px-4 h-16 border-b border-border">
              <Link
                href="/"
                aria-label="Poligraph, accueil"
                className="flex min-h-11 items-center gap-3"
                onClick={close}
              >
                <Logo size={36} />
                <span className="text-lg font-display font-bold">Poligraph</span>
              </Link>
              <button
                onClick={close}
                className="flex items-center justify-center h-11 w-11 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                aria-label="Fermer le menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Primary links */}
            <nav className="flex-1 overflow-y-auto px-4 py-6" aria-label="Navigation principale">
              {/* Looks like a field, opens the full-screen search: typing inside the menu would
                  share the screen between keyboard, menu and results. */}
              <button
                ref={searchFieldRef}
                type="button"
                onClick={openSearchScreen}
                aria-label="Rechercher un élu, une commune, un vote"
                className="mb-6 flex min-h-12 w-full items-center gap-3 rounded-xl border border-input bg-background px-4 text-left text-base text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground"
              >
                <Search className="h-5 w-5 shrink-0" aria-hidden="true" />
                <span className="truncate">Élu, commune, vote...</span>
              </button>

              {primaryGroups.map(renderGroup)}

              {/* Upcoming elections first, past ones last */}
              {filteredElections.length > 0 && (
                <section aria-labelledby="mobile-menu-elections" className="mt-6">
                  <h2 id="mobile-menu-elections" className={GROUP_TITLE_CLASS}>
                    Élections
                  </h2>
                  <ul className="space-y-1">
                    {filteredElections.map((item) => {
                      const Icon = item.icon ? ICON_MAP[item.icon] : null;
                      const isActive =
                        pathname === item.href || pathname.startsWith(item.href + "/");
                      const isPast = pastSlugs.has(item.slug);
                      const isSpotlight = item.slug === spotlightSlug;
                      return (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            onClick={close}
                            aria-current={isActive ? "page" : undefined}
                            className={`flex items-center justify-between gap-2 min-h-12 px-4 py-2.5 rounded-xl text-base font-display font-bold transition-colors ${
                              isSpotlight
                                ? "border-2 border-primary bg-primary/5 text-primary hover:bg-primary/10"
                                : isPast
                                  ? "text-foreground hover:bg-muted"
                                  : "border border-primary/40 text-primary hover:bg-primary/5"
                            }`}
                          >
                            <span className="flex items-center gap-3 min-w-0">
                              {Icon && <Icon className="h-5 w-5 shrink-0" />}
                              {item.label}
                              {/* A past election links to its results: the badge says what is
                                  behind the link rather than that it is over. In light, a red
                                  tint under red text measures 3.86:1 at 12px, below AA: the
                                  badge is outlined there instead (4.99:1). */}
                              <span
                                className={`shrink-0 whitespace-nowrap text-xs font-medium px-2 py-0.5 rounded-full ${
                                  isPast
                                    ? "border border-brand-on-surface/40 text-brand-on-surface dark:border-transparent dark:bg-brand/15"
                                    : "bg-primary/15 text-primary"
                                }`}
                              >
                                {isPast ? "Résultats" : "À venir"}
                              </span>
                            </span>
                            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}

              <div className="mt-6">{toolGroups.map(renderGroup)}</div>

              <Link
                href="/signaler"
                onClick={close}
                className="mt-6 flex min-h-12 items-center justify-between gap-3 rounded-xl border border-primary px-4 py-2.5 font-display text-[15px] font-bold text-primary transition-colors hover:bg-primary/5"
              >
                <span className="flex items-center gap-3">
                  <MessageSquareWarning className="h-5 w-5 shrink-0" aria-hidden="true" />
                  Signaler une erreur ou proposer une amélioration
                </span>
                <ChevronRight className="h-5 w-5 shrink-0" aria-hidden="true" />
              </Link>
            </nav>

            {/* Bottom section: theme toggle + boussole + CTA.
                Wraps: the three pills measure 405px side by side, which overflows every viewport
                narrower than that, 320px included (WCAG 1.4.10). */}
            <div className="px-4 py-6 border-t border-border">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <MobileThemeToggle />
                  {enabledFlags.includes("BOUSSOLE_ENABLED") && (
                    <a
                      href="https://boussole.poligraph.fr"
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={close}
                      aria-label="Boussole politique (s'ouvre dans un nouvel onglet)"
                      className="inline-flex items-center gap-2 px-4 min-h-11 py-2.5 rounded-full border border-border text-sm font-medium text-foreground/80 hover:bg-muted hover:text-foreground transition-colors"
                    >
                      <Compass className="h-5 w-5" aria-hidden="true" />
                      <span>Boussole</span>
                    </a>
                  )}
                </div>
                <Link
                  href="/soutenir"
                  onClick={close}
                  className="inline-flex items-center gap-2 px-5 min-h-11 py-2.5 rounded-full border-2 border-red-500 text-red-500 font-semibold text-sm hover:bg-red-500/10 transition-colors"
                >
                  <Heart className="h-4 w-4" />
                  Nous soutenir
                </Link>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
