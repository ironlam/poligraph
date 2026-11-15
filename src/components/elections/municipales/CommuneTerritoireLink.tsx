import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { territoireCommunePath } from "@/lib/territoires/paths";

/**
 * Bridge from an election page to the commune's Territoires page (#1052, Liens.html P1). Rendered
 * only for a commune read from the base, so the destination exists. It names what that page shows
 * today and nothing more: no council composition, intercommunality or decisions.
 */
export function CommuneTerritoireLink({ inseeCode, name }: { inseeCode: string; name: string }) {
  return (
    <aside
      aria-labelledby="commune-territoire-title"
      className="rounded-lg border bg-muted/40 p-4 md:p-5"
    >
      <h2 id="commune-territoire-title" className="font-semibold">
        Le dossier de la commune
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Le maire en fonction, les députés et sénateurs du département et les résultats électoraux,
        chacun avec sa source.
      </p>
      <Link
        href={territoireCommunePath(inseeCode, name)}
        prefetch={false}
        className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Voir {name} dans Territoires
        <ArrowRight aria-hidden="true" className="h-4 w-4" />
      </Link>
    </aside>
  );
}
