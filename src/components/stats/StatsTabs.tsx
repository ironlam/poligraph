import Link from "next/link";
import type { ReactNode } from "react";
import { BarChart3, FileText, Scale, ShieldCheck } from "lucide-react";
import { statsHref, type StatsTab } from "@/config/routes";

const ITEMS: Array<{
  tab: StatsTab;
  label: string;
  shortLabel: string;
  icon: typeof Scale;
}> = [
  { tab: "judiciaire", label: "Judiciaire", shortLabel: "Justice", icon: Scale },
  { tab: "factchecks", label: "Fact-checking", shortLabel: "Facts", icon: ShieldCheck },
  { tab: "legislatif", label: "Législatif", shortLabel: "Lois", icon: FileText },
  {
    tab: "participation",
    label: "Participation aux scrutins publics",
    shortLabel: "Votes",
    icon: BarChart3,
  },
];

/** Server-rendered navigation avoids mounting and prefetching hidden datasets. */
export function StatsTabs({ active, children }: { active: StatsTab; children: ReactNode }) {
  return (
    <>
      <nav aria-label="Rubriques statistiques" className="overflow-x-auto pb-1">
        <ul className="flex min-w-max gap-1 rounded-lg bg-muted p-[3px]">
          {ITEMS.map((item) => {
            const Icon = item.icon;
            const selected = item.tab === active;
            return (
              <li key={item.tab}>
                <Link
                  href={statsHref(item.tab)}
                  prefetch={false}
                  aria-current={selected ? "page" : undefined}
                  className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    selected
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon aria-hidden="true" className="h-4 w-4" />
                  <span className="hidden sm:inline">{item.label}</span>
                  <span className="sm:hidden">{item.shortLabel}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {children}
    </>
  );
}
