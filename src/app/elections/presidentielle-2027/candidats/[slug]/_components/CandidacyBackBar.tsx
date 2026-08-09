import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/**
 * The way out of a candidate fiche, visible at every scroll position.
 *
 * The breadcrumb carries the hierarchy, which is not the same thing as an exit: a reader who has
 * just finished the page had to travel back up to leave it, and on a phone that is the whole page.
 *
 * The handoff draws a Poligraph logo inside this bar, but that logo is the site header, which this
 * layout already renders `sticky top-0` two pixels above. Reproducing it would stack two bars and
 * two logos, so the bar carries the one control the header does not: the way back to the field.
 * `top-16` is the header's own `h-16`, and the pattern (offset, z-index, blur) is the one
 * `AffairStickyBar` already established for a sub-bar on a detail page.
 *
 * One control at both widths rather than the mockup's arrow + text pair, for the same reason: the
 * pair only existed to flank the logo. Two links to the same page, side by side, name one
 * destination twice.
 */
export function CandidacyBackBar({ electionSlug }: { electionSlug: string }) {
  return (
    <nav
      aria-label="Retour à la liste des candidatures"
      className="sticky top-16 z-30 border-b bg-background/80 backdrop-blur-md"
    >
      <div className="container mx-auto flex items-center px-4 py-2">
        <Link
          href={`/elections/${electionSlug}`}
          prefetch={false}
          className="inline-flex min-h-11 items-center gap-2 rounded-[11px] border border-border bg-card px-3 font-display text-sm font-bold text-primary hover:border-primary hover:bg-muted lg:min-h-[42px] lg:px-4"
        >
          <ArrowLeft aria-hidden="true" className="h-[19px] w-[19px] shrink-0" />
          Toutes les candidatures
        </Link>
      </div>
    </nav>
  );
}
