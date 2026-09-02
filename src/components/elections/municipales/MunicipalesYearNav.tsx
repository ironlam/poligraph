"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Home, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { CommuneSearch } from "./CommuneSearch";

/**
 * The sticky tab bar shared by every municipal election year.
 *
 * 2014, 2020 and 2026 each carried a full copy of this chrome. Only the tab list and the search
 * props ever differed, so those are the props; everything else is here once. Each year keeps its
 * own named component so the layouts and their imports are unchanged.
 */

export interface MunicipalesTab {
  href: string;
  label: string;
  icon: typeof Home;
  /** Match the pathname exactly instead of by prefix. Use it on the section root. */
  exact?: boolean;
}

export interface MunicipalesYearNavProps {
  tabs: MunicipalesTab[];
  /** Passed straight to `CommuneSearch`; `basePath` picks the year's API route. */
  search: {
    basePath?: string;
    label?: string;
    placeholder?: string;
  };
}

const TAB_BASE =
  "flex items-center gap-1.5 px-3 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors";
const TAB_ACTIVE = "border-primary text-primary";
const TAB_IDLE =
  "border-transparent text-muted-foreground hover:text-foreground hover:border-border";

export function MunicipalesYearNav({ tabs, search }: MunicipalesYearNavProps) {
  const pathname = usePathname();
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <div className="border-b bg-background/80 backdrop-blur-sm sticky top-16 z-40">
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide -mb-px">
          {tabs.map((tab) => {
            const isActive = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                prefetch={false}
                aria-current={isActive ? "page" : undefined}
                className={cn(TAB_BASE, isActive ? TAB_ACTIVE : TAB_IDLE)}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {tab.label}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setSearchOpen(!searchOpen)}
            aria-expanded={searchOpen}
            aria-label="Rechercher une commune"
            className={cn(TAB_BASE, "ml-auto", searchOpen ? TAB_ACTIVE : TAB_IDLE)}
          >
            <Search className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Chercher une commune</span>
          </button>
        </div>
        {searchOpen && (
          <div className="py-3 border-t">
            <CommuneSearch
              {...search}
              placeholder={search.placeholder ?? "Rechercher une commune..."}
              className="max-w-md"
            />
          </div>
        )}
      </div>
    </div>
  );
}
