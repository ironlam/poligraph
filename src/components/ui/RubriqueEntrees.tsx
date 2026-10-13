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
      <h2 id={titreId} className="font-display text-2xl font-extrabold text-primary">
        {titre}
      </h2>
      <ul className={cn("mt-4 grid grid-cols-2 gap-3", COLONNES_LG[entrees.length])}>
        {entrees.map(({ href, title, detail, icon: Icon }) => (
          <li key={href} className="last:odd:col-span-2 lg:last:odd:col-span-1">
            <Link
              href={href}
              prefetch={false}
              className="flex h-full min-h-11 flex-col gap-4 rounded-xl border border-border bg-card p-4 hover:border-primary/40 hover:bg-muted/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <span className="flex items-center justify-between">
                <span
                  className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary"
                  aria-hidden="true"
                >
                  <Icon className="h-5 w-5" />
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              </span>
              <span className="block">
                <span className="block font-display text-lg font-bold text-primary">{title}</span>
                <span className="mt-1 block text-sm text-muted-foreground">{detail}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
