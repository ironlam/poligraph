"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCommandPalette } from "@/components/search";
import { MobileThemeToggle } from "@/components/theme/MobileThemeToggle";
import { NAV_ELECTIONS, NAV_PRIMARY, NAV_SECONDARY } from "@/config/navigation";
import {
  BarChart3,
  Users,
  Scale,
  Vote,
  Landmark,
  ArrowLeftRight,
  MapPin,
  Building,
  Search,
  Menu,
  X,
  ChevronRight,
  Heart,
  BookOpen,
  Compass,
  ShieldAlert,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Logo } from "./Logo";

const ICON_MAP: Record<string, LucideIcon> = {
  barChart: BarChart3,
  users: Users,
  scale: Scale,
  vote: Vote,
  landmark: Landmark,
  arrowLeftRight: ArrowLeftRight,
  mapPin: MapPin,
  building: Building,
  search: Search,
  bookOpen: BookOpen,
  compass: Compass,
  shieldAlert: ShieldAlert,
};

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
}

export function MobileMenu({ enabledFlags, pastElectionSlugs }: MobileMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  const { open: openPalette } = useCommandPalette();
  const flagSet = new Set(enabledFlags);

  const filteredPrimary = NAV_PRIMARY.filter(
    (item) => !item.featureFlag || flagSet.has(item.featureFlag)
  );
  const filteredSecondary = NAV_SECONDARY.filter(
    (item) => !item.featureFlag || flagSet.has(item.featureFlag)
  );
  // Upcoming first, held ones after, each group keeping its NAV_ELECTIONS order
  const pastSlugs = new Set(pastElectionSlugs);
  const filteredElections = NAV_ELECTIONS.filter(
    (item) => !item.featureFlag || flagSet.has(item.featureFlag)
  ).sort((a, b) => Number(pastSlugs.has(a.slug)) - Number(pastSlugs.has(b.slug)));

  const close = useCallback(() => {
    setIsOpen(false);
    toggleRef.current?.focus();
  }, []);

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

  // Focus first element on open
  useEffect(() => {
    if (isOpen && menuRef.current) {
      const focusable = getFocusableElements(menuRef.current);
      focusable[0]?.focus();
    }
  }, [isOpen]);

  // Close on route change
  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

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

        {/* Hamburger */}
        <button
          ref={toggleRef}
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center justify-center h-10 w-10 rounded-lg text-foreground/70 hover:text-foreground hover:bg-muted/50 transition-colors"
          aria-label={isOpen ? "Fermer le menu" : "Ouvrir le menu"}
          aria-expanded={isOpen}
          aria-controls="mobile-menu"
        >
          {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
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
                className="flex items-center gap-3"
                onClick={close}
              >
                <Logo size={36} />
                <span className="text-lg font-display font-bold">Poligraph</span>
              </Link>
              <button
                onClick={close}
                className="flex items-center justify-center h-10 w-10 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                aria-label="Fermer le menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Primary links */}
            <nav className="flex-1 overflow-y-auto px-4 py-6" aria-label="Navigation principale">
              {/* Elections surfaced above the rest: upcoming first, past last */}
              {filteredElections.length > 0 && (
                <section aria-labelledby="mobile-menu-elections" className="mb-6">
                  <h2
                    id="mobile-menu-elections"
                    className="px-4 mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                  >
                    Élections
                  </h2>
                  <ul className="space-y-1">
                    {filteredElections.map((item) => {
                      const Icon = item.icon ? ICON_MAP[item.icon] : null;
                      const isActive =
                        pathname === item.href || pathname.startsWith(item.href + "/");
                      const isPast = pastSlugs.has(item.slug);
                      return (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            onClick={close}
                            aria-current={isActive ? "page" : undefined}
                            className={`flex items-center justify-between gap-2 px-4 py-3.5 rounded-xl text-lg font-display font-semibold transition-colors ${
                              isPast
                                ? "text-foreground/60 hover:bg-muted hover:text-foreground"
                                : "border border-primary/40 text-primary hover:bg-primary/5"
                            }`}
                          >
                            <span className="flex items-center gap-3 min-w-0">
                              {Icon && <Icon className="h-5 w-5 shrink-0" />}
                              {item.label}
                              {/* `muted-foreground-strong`: at 12px on --muted in dark, the base
                                  token measures 3.83:1, below AA. See globals.css. */}
                              <span
                                className={`shrink-0 whitespace-nowrap text-xs font-medium px-2 py-0.5 rounded-full ${
                                  isPast
                                    ? "bg-muted text-muted-foreground-strong"
                                    : "bg-primary/15 text-primary"
                                }`}
                              >
                                {isPast ? "Passée" : "À venir"}
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

              <ul className="space-y-1">
                {filteredPrimary.map((item) => {
                  const Icon = item.icon ? ICON_MAP[item.icon] : null;
                  const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                  const className = `flex items-center justify-between px-4 py-4 rounded-xl text-xl font-display font-semibold transition-colors ${
                    item.highlight
                      ? "border border-primary/40 text-primary"
                      : isActive
                        ? "bg-muted text-foreground"
                        : "text-foreground/80 hover:bg-muted hover:text-foreground"
                  }`;
                  const children = (
                    <>
                      <span className="flex items-center gap-3">
                        {Icon && <Icon className="h-6 w-6" />}
                        {item.label}
                        {item.highlight && (
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-primary/15 text-primary">
                            En cours
                          </span>
                        )}
                      </span>
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    </>
                  );
                  return (
                    <li key={item.href}>
                      {item.external ? (
                        <a
                          href={item.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`${item.label} (s'ouvre dans un nouvel onglet)`}
                          onClick={close}
                          className={className}
                        >
                          {children}
                        </a>
                      ) : (
                        <Link
                          href={item.href}
                          onClick={close}
                          aria-current={isActive ? "page" : undefined}
                          className={className}
                        >
                          {children}
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>

              {/* Secondary links as pills */}
              {filteredSecondary.length > 0 && (
                <div className="mt-8 pt-6 border-t border-border">
                  <div className="flex flex-wrap gap-3">
                    {filteredSecondary.map((item) => {
                      const Icon = item.icon ? ICON_MAP[item.icon] : null;
                      const className =
                        "inline-flex items-center gap-2 px-4 py-2.5 rounded-full border border-border text-sm font-medium text-foreground/80 hover:bg-muted hover:text-foreground transition-colors";
                      return item.external ? (
                        <a
                          key={item.href}
                          href={item.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`${item.label} (s'ouvre dans un nouvel onglet)`}
                          onClick={close}
                          className={className}
                        >
                          {Icon && <Icon className="h-4 w-4" />}
                          {item.label}
                        </a>
                      ) : (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={close}
                          className={className}
                        >
                          {Icon && <Icon className="h-4 w-4" />}
                          {item.label}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}
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
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full border border-border text-sm font-medium text-foreground/80 hover:bg-muted hover:text-foreground transition-colors"
                    >
                      <Compass className="h-5 w-5" aria-hidden="true" />
                      <span>Boussole</span>
                    </a>
                  )}
                </div>
                <Link
                  href="/soutenir"
                  onClick={close}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border-2 border-red-500 text-red-500 font-semibold text-sm hover:bg-red-500/10 transition-colors"
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
