import { Suspense } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { AffairReturnLink, AffairReturnLinkFallback } from "@/components/affairs/AffairReturnLink";
import { AffairShareActions } from "@/components/affairs/AffairShareActions";

/**
 * Sticky sub-bar under the site header on an affair detail page: non-destructive
 * return, a compact breadcrumb, and Citer/Partager. Server shell so the page
 * stays static (ISR); only the return link (URL-dependent) and the share
 * buttons (clipboard) are client islands, the return one behind a Suspense
 * boundary with a generic fallback.
 */
interface AffairStickyBarProps {
  title: string;
  shareUrl: string;
  shareText: string;
  superCategoryLabel: string;
  superCategoryHref: string;
}

export function AffairStickyBar({
  title,
  shareUrl,
  shareText,
  superCategoryLabel,
  superCategoryHref,
}: AffairStickyBarProps) {
  return (
    <div className="sticky top-16 z-30 border-b bg-background/80 backdrop-blur-md">
      <div className="container mx-auto flex max-w-4xl items-center gap-2 px-4 py-1.5">
        <Suspense fallback={<AffairReturnLinkFallback />}>
          <AffairReturnLink />
        </Suspense>

        <nav
          aria-label="Fil d'Ariane"
          className="hidden min-w-0 flex-1 items-center gap-1 text-sm text-muted-foreground md:flex"
        >
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/50" aria-hidden="true" />
          <Link href={superCategoryHref} className="shrink-0 hover:text-foreground hover:underline">
            {superCategoryLabel}
          </Link>
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/50" aria-hidden="true" />
          <span className="truncate text-foreground" title={title}>
            {title}
          </span>
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          <AffairShareActions title={title} shareUrl={shareUrl} shareText={shareText} />
        </div>
      </div>
    </div>
  );
}
