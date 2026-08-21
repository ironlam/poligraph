"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsLeft, ChevronsRight, ExternalLink, Menu, X } from "lucide-react";
import {
  ADMIN_NAVIGATION_GROUPS,
  getCounterValue,
  isAdminNavigationActive,
  type AdminCounterKey,
} from "@/config/admin-navigation";

const STORAGE_KEY = "admin-sidebar-collapsed";

type BadgeResponse = {
  drafts: { affairs: number; politicians: number };
  moderation: { proposalsPending: number; proposalsConflict: number; reviewsPending: number };
  matching: { decisionsPending: number; articlesPending: number; duplicatesPending: number };
  // Optionnel : pendant un déploiement progressif, l'API peut encore être la version qui ne
  // renvoie pas ce compteur, et la barre latérale ne doit pas casser pour un badge.
  candidacies?: { publicationPending: number };
  press: { rejectionsPending: number };
  operations: { failedPipelines: number; failedSyncs: number };
};

const EMPTY_BADGES: BadgeResponse = {
  drafts: { affairs: 0, politicians: 0 },
  moderation: { proposalsPending: 0, proposalsConflict: 0, reviewsPending: 0 },
  matching: { decisionsPending: 0, articlesPending: 0, duplicatesPending: 0 },
  candidacies: { publicationPending: 0 },
  press: { rejectionsPending: 0 },
  operations: { failedPipelines: 0, failedSyncs: 0 },
};

function flattenBadges(badges: BadgeResponse): Record<string, number> {
  return {
    "drafts.affairs": badges.drafts.affairs,
    "drafts.politicians": badges.drafts.politicians,
    "moderation.proposalsPending": badges.moderation.proposalsPending,
    "moderation.proposalsConflict": badges.moderation.proposalsConflict,
    "moderation.reviewsPending": badges.moderation.reviewsPending,
    "matching.decisionsPending": badges.matching.decisionsPending,
    "matching.articlesPending": badges.matching.articlesPending,
    "matching.duplicatesPending": badges.matching.duplicatesPending,
    "candidacies.publicationPending": badges.candidacies?.publicationPending ?? 0,
    "press.rejectionsPending": badges.press.rejectionsPending,
    "operations.failedPipelines": badges.operations.failedPipelines,
    "operations.failedSyncs": badges.operations.failedSyncs,
  };
}

export function AdminSidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(STORAGE_KEY) === "true";
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [badges, setBadges] = useState<BadgeResponse>(EMPTY_BADGES);

  useEffect(() => {
    const refresh = () => {
      fetch("/api/admin/badges")
        .then((response) => (response.ok ? response.json() : null))
        .then((data: BadgeResponse | null) => data && setBadges(data))
        .catch(() => {});
    };
    refresh();
    const interval = setInterval(refresh, 60_000);
    return () => clearInterval(interval);
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- close the mobile drawer after navigation
  useEffect(() => setMobileOpen(false), [pathname]);

  const toggleCollapse = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(STORAGE_KEY, String(next));
  };

  const counters = flattenBadges(badges);
  const navigation = (
    <nav role="navigation" aria-label="Administration" className="flex-1 overflow-y-auto py-3 px-2">
      {ADMIN_NAVIGATION_GROUPS.map((group) => (
        <section
          key={group.id}
          aria-labelledby={`admin-group-${group.id}`}
          className="mb-4 last:mb-0"
        >
          {!collapsed && (
            <h2
              id={`admin-group-${group.id}`}
              className="px-3 mb-1 text-[10px] uppercase tracking-wider text-white/45"
            >
              {group.label}
            </h2>
          )}
          <ul className="space-y-0.5">
            {group.items.map((item) => (
              <NavLink
                key={item.id}
                item={item}
                active={isAdminNavigationActive(pathname, item)}
                collapsed={collapsed}
                badge={getCounterValue(counters, item.counterKey)}
              />
            ))}
          </ul>
        </section>
      ))}
    </nav>
  );

  const sidebarContent = (
    <>
      <div className="flex items-center gap-3 px-4 h-14 border-b border-white/10 shrink-0">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold shrink-0"
          style={{ backgroundColor: "oklch(0.52 0.2 25)", color: "white" }}
        >
          P
        </div>
        {!collapsed && (
          <span className="font-display font-semibold text-white text-sm tracking-tight">
            Poligraph
          </span>
        )}
      </div>
      {navigation}
      <div className="border-t border-white/10 p-2 shrink-0 space-y-1">
        <Link
          href="/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 min-h-11 px-3 py-2 text-xs text-white/60 hover:text-white/90 rounded-md hover:bg-white/5"
          title={collapsed ? "Voir le site" : undefined}
        >
          <ExternalLink className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          {!collapsed && <span>Voir le site</span>}
        </Link>
        <form action="/api/admin/logout" method="POST">
          <button
            type="submit"
            className={`w-full min-h-11 flex items-center gap-2 px-3 py-2 text-xs text-white/60 hover:text-white/90 rounded-md hover:bg-white/5 ${collapsed ? "justify-center" : ""}`}
          >
            {!collapsed && <span>Déconnexion</span>}
            {collapsed && <span className="sr-only">Déconnexion</span>}
          </button>
        </form>
        <button
          onClick={toggleCollapse}
          className="hidden lg:flex w-full min-h-11 items-center gap-2 px-3 py-2 text-xs text-white/60 hover:text-white/90 rounded-md hover:bg-white/5"
          aria-label={collapsed ? "Développer la sidebar" : "Réduire la sidebar"}
          title={collapsed ? "Développer la sidebar" : "Réduire la sidebar"}
        >
          {collapsed ? (
            <ChevronsRight className="w-4 h-4 mx-auto" aria-hidden="true" />
          ) : (
            <>
              <ChevronsLeft className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>Réduire</span>
            </>
          )}
        </button>
      </div>
    </>
  );

  return (
    <>
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-2 left-2 z-50 h-11 w-11 inline-flex items-center justify-center rounded-lg bg-background border border-border shadow-md"
        aria-label="Ouvrir le menu"
        title="Ouvrir le menu"
      >
        <Menu className="w-5 h-5" aria-hidden="true" />
      </button>
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-50 bg-black/60"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}
      <aside
        className={`lg:hidden fixed inset-y-0 left-0 z-50 w-64 flex flex-col transition-transform duration-200 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}
        style={{ backgroundColor: "oklch(0.18 0.015 250)" }}
      >
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute top-2 right-2 h-11 w-11 inline-flex items-center justify-center text-white/60 hover:text-white"
          aria-label="Fermer le menu"
          title="Fermer le menu"
        >
          <X className="w-5 h-5" aria-hidden="true" />
        </button>
        {sidebarContent}
      </aside>
      <aside
        className={`hidden lg:flex flex-col shrink-0 sticky top-0 h-screen transition-[width] duration-200 ${collapsed ? "w-16" : "w-56"}`}
        style={{ backgroundColor: "oklch(0.18 0.015 250)" }}
      >
        {sidebarContent}
      </aside>
    </>
  );
}

function NavLink({
  item,
  active,
  collapsed,
  badge,
}: {
  item: {
    href: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    counterKey?: AdminCounterKey;
  };
  active: boolean;
  collapsed: boolean;
  badge?: number;
}) {
  const Icon = item.icon;
  return (
    <li>
      <Link
        href={item.href}
        aria-current={active ? "page" : undefined}
        aria-label={collapsed ? item.label : undefined}
        title={collapsed ? item.label : undefined}
        className={`relative min-h-11 flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${active ? "bg-white/12 text-white font-medium" : "text-white/60 hover:text-white hover:bg-white/6"} ${collapsed ? "justify-center" : ""}`}
      >
        <Icon className="w-4.5 h-4.5 shrink-0" aria-hidden="true" />
        {!collapsed && (
          <>
            <span className="truncate">{item.label}</span>
            {badge !== undefined && badge > 0 && (
              <span
                className="ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                style={{ backgroundColor: "oklch(0.52 0.2 25)", color: "white" }}
              >
                {badge}
              </span>
            )}
          </>
        )}
        {collapsed && badge !== undefined && badge > 0 && (
          <span
            className="absolute top-2 right-2 w-2 h-2 rounded-full"
            style={{ backgroundColor: "oklch(0.52 0.2 25)" }}
            aria-label={`${badge} élément${badge > 1 ? "s" : ""} en attente`}
          />
        )}
      </Link>
    </li>
  );
}
