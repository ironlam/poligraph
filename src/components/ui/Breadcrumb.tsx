import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { BreadcrumbJsonLd } from "@/components/seo/JsonLd";
import { cn } from "@/lib/utils";

const SITE_URL = "https://poligraph.fr";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

export function Breadcrumb({ items }: BreadcrumbProps) {
  const allItems: BreadcrumbItem[] = [{ label: "Accueil", href: "/" }, ...items];

  return (
    <>
      <BreadcrumbJsonLd
        items={allItems.map((item) => ({
          name: item.label,
          url: `${SITE_URL}${item.href || ""}`,
        }))}
      />
      <nav
        aria-label="Fil d'Ariane"
        className="container mx-auto px-4 text-sm text-muted-foreground pt-2 mb-4 max-sm:mb-1 max-sm:pt-0"
      >
        <ol className="flex items-center gap-1 flex-wrap">
          {allItems.map((item, i) => {
            const isLast = i === allItems.length - 1;
            // Below `sm` the trail shows one step only, the way back to the parent: the page title
            // already names where the reader is. Every step stays in the HTML at every width.
            const isParent = i === allItems.length - 2;

            return (
              <li
                key={item.href || item.label}
                className={cn("flex items-center gap-1", !isParent && "max-sm:hidden")}
              >
                {i > 0 && (
                  <ChevronRight
                    className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0 max-sm:hidden"
                    aria-hidden="true"
                  />
                )}
                {isLast ? (
                  <span className="text-foreground font-medium" aria-current="page">
                    {item.label}
                  </span>
                ) : (
                  <Link
                    href={item.href!}
                    className="inline-flex items-center gap-1 hover:text-primary transition-colors max-sm:min-h-11 max-sm:font-medium max-sm:text-primary"
                  >
                    {isParent && (
                      <ChevronLeft className="h-4 w-4 shrink-0 sm:hidden" aria-hidden="true" />
                    )}
                    {item.label}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
    </>
  );
}
