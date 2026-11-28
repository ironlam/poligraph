import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ROUTES } from "@/config/routes";
import { cn } from "@/lib/utils";

/**
 * The one way a page points to /parlement/motions-de-censure: a framed link with a line saying what
 * the page holds. Same object on a motion's page and on a search about censure, so a reader
 * recognises it from one to the other. Muted on purpose: it sits next to result blocks and must not
 * compete with them.
 */
export function MotionsDeCensureCallout({ className }: { className?: string }) {
  return (
    <Link
      href={ROUTES.motionsDeCensure}
      prefetch={false}
      className={cn(
        "group flex min-h-11 items-center justify-between gap-3 rounded-lg border bg-muted/40 px-4 py-3 text-sm transition-colors hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        className
      )}
    >
      <span className="min-w-0">
        <span className="block font-semibold text-primary group-hover:underline">
          Toutes les motions de censure votées à l&apos;Assemblée
        </span>
        <span className="block text-muted-foreground">
          Voix pour, majorité requise, gouvernement visé et résultat, sur une seule page.
        </span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </Link>
  );
}
