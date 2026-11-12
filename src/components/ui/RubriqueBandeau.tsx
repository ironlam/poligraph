import Link from "next/link";
import { BreadcrumbJsonLd } from "@/components/seo/JsonLd";
import { SITE_URL } from "@/config/site";
import { BRAND_NAVY, BRAND_PAGE, BRAND_RED } from "@/config/brand";
import { cn } from "@/lib/utils";

/**
 * Navy banner of the section landing pages and the Territoires pages, under a tricolour rule. The
 * colours are brand constants rather than theme tokens: the banner stays navy in dark mode, and
 * the outlines drawn on it (`TerritoryShape` tone "marine") assume that background.
 */
export function RubriqueBandeau({
  children,
  className,
  labelledBy,
}: {
  children: React.ReactNode;
  className?: string;
  labelledBy: string;
}) {
  return (
    <section
      aria-labelledby={labelledBy}
      className={cn("text-white", className)}
      style={{ backgroundColor: BRAND_NAVY }}
    >
      <div className="flex h-1" aria-hidden="true">
        <span className="flex-1" style={{ backgroundColor: BRAND_NAVY }} />
        <span className="flex-1" style={{ backgroundColor: BRAND_PAGE }} />
        <span className="flex-1" style={{ backgroundColor: BRAND_RED }} />
      </div>
      <div className="container mx-auto px-4 py-4 sm:py-10">{children}</div>
    </section>
  );
}

/** Pill-shaped overline on the navy banner. */
export function BandeauSurtitre({ children }: { children: React.ReactNode }) {
  return (
    // From sm up only: on a phone the pill repeats the title right under it and costs a line.
    <p className="hidden items-center rounded-full border border-white/40 px-3 py-1 text-sm font-bold sm:inline-flex">
      {children}
    </p>
  );
}

/** Breadcrumb on the navy banner, with its JSON-LD. The last item is the current page. */
export function BandeauFilAriane({ items }: { items: { label: string; href?: string }[] }) {
  const all = [{ label: "Accueil", href: "/" }, ...items];
  return (
    <>
      <BreadcrumbJsonLd
        items={all.map((item) => ({ name: item.label, url: `${SITE_URL}${item.href ?? ""}` }))}
      />
      <nav aria-label="Fil d'Ariane" className="text-sm text-white/85">
        <ol className="flex flex-wrap items-center gap-x-1">
          {all.map((item, i) => {
            // Below sm the trail shows the parent step only, like `Breadcrumb`: the title names
            // the page. Every step stays in the HTML.
            const hiddenOnPhone = i !== all.length - 2 && "max-sm:hidden";
            return i < all.length - 1 && item.href ? (
              <li key={item.label} className={cn("flex items-center gap-1", hiddenOnPhone)}>
                <Link
                  href={item.href}
                  className="inline-flex min-h-11 items-center gap-1 underline underline-offset-4 hover:text-white"
                >
                  <span aria-hidden="true" className="sm:hidden">
                    ‹
                  </span>
                  {item.label}
                </Link>
                <span aria-hidden="true" className="max-sm:hidden">
                  ›
                </span>
              </li>
            ) : (
              <li
                key={item.label}
                aria-current="page"
                className={cn("font-medium text-white", hiddenOnPhone)}
              >
                {item.label}
              </li>
            );
          })}
        </ol>
      </nav>
    </>
  );
}
