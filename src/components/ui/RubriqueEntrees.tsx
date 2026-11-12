import Link from "next/link";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface RubriqueEntree {
  href: string;
  title: string;
  detail: string;
  icon: LucideIcon;
}

// Classes écrites en entier : Tailwind ne génère pas les noms construits dynamiquement.
const COLONNES_LG: Record<number, string> = {
  3: "lg:grid-cols-3",
  4: "lg:grid-cols-4",
  5: "lg:grid-cols-5",
};

export function RubriqueEntrees({
  titre,
  titreId,
  entrees,
}: {
  titre: string;
  titreId: string;
  entrees: RubriqueEntree[];
}) {
  return (
    <section aria-labelledby={titreId}>
      <h2 id={titreId} className="font-display text-2xl font-extrabold text-primary max-sm:sr-only">
        {titre}
      </h2>
      {/* Below sm: one line that scrolls sideways, so the entries do not push the listing down. */}
      <ul
        className={cn(
          "-mx-4 flex gap-2 overflow-x-auto px-4 sm:mt-4 sm:gap-3 [scrollbar-width:none] sm:mx-0 sm:overflow-visible sm:px-0 sm:grid sm:grid-cols-2",
          COLONNES_LG[entrees.length]
        )}
      >
        {entrees.map(({ href, title, detail, icon: Icon }) => (
          <li
            key={href}
            className="shrink-0 sm:w-auto sm:last:odd:col-span-2 lg:last:odd:col-span-1"
          >
            <Link
              href={href}
              prefetch={false}
              className="flex h-full min-h-11 items-center rounded-full border border-border bg-card px-4 hover:border-primary/40 sm:flex-col sm:items-stretch sm:gap-4 sm:rounded-xl sm:p-4 hover:bg-muted/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <span className="hidden items-center justify-between sm:flex">
                <span
                  className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary"
                  aria-hidden="true"
                >
                  <Icon className="h-5 w-5" />
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              </span>
              {/* Below sm: a one-line pill, title then figure. From sm: the tile. */}
              <span className="flex items-baseline gap-2 whitespace-nowrap sm:block sm:whitespace-normal">
                <span className="block font-display text-sm font-bold text-primary sm:text-lg">
                  {title}
                </span>
                <span className="block text-xs text-muted-foreground sm:mt-1 sm:text-sm">
                  {detail}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
