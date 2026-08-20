"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Home } from "lucide-react";
import { findAdminNavigationEntry } from "@/config/admin-navigation";

interface Crumb {
  label: string;
  href: string;
}

function buildCrumbs(pathname: string): Crumb[] {
  const entry = findAdminNavigationEntry(pathname);
  const segments = pathname.split("/").filter(Boolean);
  const crumbs: Crumb[] = [{ label: "À traiter", href: "/admin" }];

  if (entry && entry.href !== "/admin") {
    crumbs.push({
      label: entry.breadcrumb ?? entry.label,
      href: entry.href.split("?")[0] ?? "/admin",
    });
  }

  const base = entry?.href.split("?")[0] ?? "/admin";
  const baseSegments = base.split("/").filter(Boolean).length;
  for (let i = baseSegments; i < segments.length; i++) {
    const segment = segments[i]!;
    const href = "/" + segments.slice(0, i + 1).join("/");
    const label = segment.length > 20 ? `${segment.slice(0, 17)}...` : segment;
    crumbs.push({ label, href });
  }

  return crumbs;
}

export function AdminBreadcrumb() {
  const crumbs = buildCrumbs(usePathname());
  if (crumbs.length <= 1) return null;

  return (
    <nav aria-label="Fil d’Ariane" className="flex items-center gap-1 text-sm">
      <Link
        href="/admin"
        className="text-muted-foreground hover:text-foreground transition-colors min-h-11 min-w-11 inline-flex items-center justify-center rounded"
        aria-label="À traiter"
      >
        <Home className="w-3.5 h-3.5" aria-hidden="true" />
      </Link>
      {crumbs.slice(1).map((crumb, i) => {
        const isLast = i === crumbs.length - 2;
        return (
          <span key={`${crumb.href}-${crumb.label}`} className="flex items-center gap-1">
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50" aria-hidden="true" />
            {isLast ? (
              <span className="font-medium text-foreground" aria-current="page">
                {crumb.label}
              </span>
            ) : (
              <Link
                href={crumb.href}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                {crumb.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
