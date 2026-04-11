"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Scale,
  Users,
  Building2,
  FileText,
  RefreshCw,
  ToggleLeft,
  History,
  HeartPulse,
  Settings,
  ChevronsLeft,
  ChevronsRight,
  Menu,
  X,
  ExternalLink,
  ShieldX,
  Newspaper,
  ShieldCheck,
  Crown,
  Share2,
  Fingerprint,
  BarChart3,
} from "lucide-react";

const STORAGE_KEY = "admin-sidebar-collapsed";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
}

const contentItems: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/affaires", label: "Affaires", icon: Scale },
  { href: "/admin/politiques", label: "Politiques", icon: Users },
  { href: "/admin/partis", label: "Partis", icon: Building2 },
  { href: "/admin/maires", label: "Maires", icon: Crown },
  { href: "/admin/dossiers", label: "Dossiers", icon: FileText },
  { href: "/admin/affair-matching/review", label: "Liaison affaires", icon: Fingerprint },
  { href: "/admin/affair-matching/dashboard", label: "Stats liaison", icon: BarChart3 },
];

const mediaItems: NavItem[] = [
  { href: "/admin/presse", label: "Presse", icon: Newspaper },
  { href: "/admin/press/rejections", label: "Rejets presse", icon: ShieldX },
  { href: "/admin/factchecks", label: "Fact-checks", icon: ShieldCheck },
  { href: "/admin/social", label: "Social", icon: Share2 },
];

const systemItems: NavItem[] = [
  { href: "/admin/pipelines", label: "Pipelines", icon: HeartPulse },
  { href: "/admin/syncs", label: "Syncs", icon: RefreshCw },
  { href: "/admin/feature-toggles", label: "Feature Toggles", icon: ToggleLeft },
  { href: "/admin/audit", label: "Audit Log", icon: History },
  { href: "/admin/parametres", label: "Paramètres", icon: Settings },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname.startsWith(href);
}

export function AdminSidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(STORAGE_KEY) === "true";
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [badges, setBadges] = useState<{ affairsDraft: number }>({ affairsDraft: 0 });

  // Fetch badge counts
  useEffect(() => {
    fetch("/api/admin/badges")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setBadges(data);
      })
      .catch(() => {});

    const interval = setInterval(() => {
      fetch("/api/admin/badges")
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data) setBadges(data);
        })
        .catch(() => {});
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  // Close mobile sidebar on route change
  // eslint-disable-next-line react-hooks/set-state-in-effect -- sync with navigation
  useEffect(() => setMobileOpen(false), [pathname]);

  function toggleCollapse() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(STORAGE_KEY, String(next));
  }

  // Inject badge into Affaires item
  const itemsWithBadges = contentItems.map((item) => {
    if (item.href === "/admin/affaires" && badges.affairsDraft > 0) {
      return { ...item, badge: badges.affairsDraft };
    }
    return item;
  });

  const sidebarContent = (
    <>
      {/* Logo / Brand */}
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

      {/* Navigation */}
      <nav
        role="navigation"
        aria-label="Administration"
        className="flex-1 overflow-y-auto py-3 px-2"
      >
        <ul className="space-y-0.5">
          {itemsWithBadges.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              active={isActive(pathname, item.href)}
              collapsed={collapsed}
            />
          ))}
        </ul>

        {/* Separator */}
        <div className="my-3 mx-2 border-t border-white/10" role="separator" />

        <ul className="space-y-0.5">
          {mediaItems.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              active={isActive(pathname, item.href)}
              collapsed={collapsed}
            />
          ))}
        </ul>

        {/* Separator */}
        <div className="my-3 mx-2 border-t border-white/10" role="separator" />

        <ul className="space-y-0.5">
          {systemItems.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              active={isActive(pathname, item.href)}
              collapsed={collapsed}
            />
          ))}
        </ul>
      </nav>

      {/* Footer */}
      <div className="border-t border-white/10 p-2 shrink-0 space-y-1">
        <Link
          href="/"
          target="_blank"
          className="flex items-center gap-2 px-3 py-2 text-xs text-white/50 hover:text-white/80 rounded-md hover:bg-white/5 transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          {!collapsed && <span>Voir le site</span>}
        </Link>

        <form action="/api/admin/logout" method="POST">
          <button
            type="submit"
            className={`w-full flex items-center gap-2 px-3 py-2 text-xs text-white/50 hover:text-white/80 rounded-md hover:bg-white/5 transition-colors ${collapsed ? "justify-center" : ""}`}
          >
            {!collapsed && <span>Déconnexion</span>}
          </button>
        </form>

        {/* Collapse toggle — desktop only */}
        <button
          onClick={toggleCollapse}
          className="hidden lg:flex w-full items-center gap-2 px-3 py-2 text-xs text-white/40 hover:text-white/70 rounded-md hover:bg-white/5 transition-colors"
          aria-label={collapsed ? "Développer la sidebar" : "Réduire la sidebar"}
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
      {/* Mobile trigger */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-3 left-3 z-50 p-2 rounded-lg bg-background border border-border shadow-md"
        aria-label="Ouvrir le menu"
      >
        <Menu className="w-5 h-5" aria-hidden="true" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-50 bg-black/60"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Mobile sidebar */}
      <aside
        className={`lg:hidden fixed inset-y-0 left-0 z-50 w-64 flex flex-col transition-transform duration-200 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{ backgroundColor: "oklch(0.18 0.015 250)" }}
      >
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute top-3 right-3 p-1 text-white/50 hover:text-white"
          aria-label="Fermer le menu"
        >
          <X className="w-5 h-5" aria-hidden="true" />
        </button>
        {sidebarContent}
      </aside>

      {/* Desktop sidebar */}
      <aside
        className={`hidden lg:flex flex-col shrink-0 sticky top-0 h-screen transition-[width] duration-200 ${
          collapsed ? "w-16" : "w-56"
        }`}
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
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
}) {
  const Icon = item.icon;

  return (
    <li>
      <Link
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={`group flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
          active
            ? "bg-white/12 text-white font-medium"
            : "text-white/60 hover:text-white hover:bg-white/6"
        } ${collapsed ? "justify-center" : ""}`}
        title={collapsed ? item.label : undefined}
      >
        <Icon className="w-4.5 h-4.5 shrink-0" aria-hidden="true" />
        {!collapsed && (
          <>
            <span className="truncate">{item.label}</span>
            {item.badge !== undefined && item.badge > 0 && (
              <span
                className="ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                style={{
                  backgroundColor: "oklch(0.52 0.2 25)",
                  color: "white",
                }}
              >
                {item.badge}
              </span>
            )}
          </>
        )}
        {collapsed && item.badge !== undefined && item.badge > 0 && (
          <span
            className="absolute -top-1 -right-1 w-2 h-2 rounded-full"
            style={{ backgroundColor: "oklch(0.52 0.2 25)" }}
          />
        )}
      </Link>
    </li>
  );
}
