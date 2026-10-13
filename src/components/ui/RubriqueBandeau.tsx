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
      <div className="container mx-auto px-4 py-6 sm:py-10">{children}</div>
    </section>
  );
}

/** Pill-shaped overline on the navy banner. */
export function BandeauSurtitre({ children }: { children: React.ReactNode }) {
  return (
    <p className="inline-flex items-center rounded-full border border-white/40 px-3 py-1 text-xs font-bold sm:text-sm">
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
          {all.map((item, i) =>
            i < all.length - 1 && item.href ? (
              <li key={item.label} className="flex items-center gap-1">
                <Link
                  href={item.href}
                  className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-white"
                >
                  {item.label}
                </Link>
                <span aria-hidden="true">›</span>
              </li>
            ) : (
              <li key={item.label} aria-current="page" className="font-medium text-white">
                {item.label}
              </li>
            )
          )}
        </ol>
      </nav>
    </>
  );
}
