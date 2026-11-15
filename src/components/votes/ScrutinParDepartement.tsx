import Link from "next/link";
import { ChevronDown } from "lucide-react";
import type { ScrutinDepartement } from "@/lib/data/scrutin-departements";
import { territoireDepartementPath } from "@/lib/territoires/paths";
import { tallyEnMots } from "@/lib/votes/departement-tally";

/**
 * « Le vote par département » on a scrutin page: one line per department, in code order, with
 * a link to its Territoires page. Folded: the list runs to a hundred lines. No colour, no name,
 * the same presentation for every department. Renders nothing without a recorded position.
 */
export function ScrutinParDepartement({
  departements,
  chamber,
}: {
  departements: ScrutinDepartement[];
  chamber: "AN" | "SENAT";
}) {
  if (departements.length === 0) return null;
  const elus = chamber === "AN" ? "députés" : "sénateurs";
  return (
    <details className="group mb-8 rounded-xl border bg-card">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <h2 className="font-display text-lg font-bold">Le vote par département</h2>
        <ChevronDown
          aria-hidden="true"
          className="h-5 w-5 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      <div className="border-t px-4 pb-4 pt-3">
        <p className="text-sm text-muted-foreground">
          Positions enregistrées des {elus}, rangés dans le département où ils siégeaient le jour du
          vote. Les élus qui ne représentent pas un département ne figurent pas dans cette liste.
        </p>
        <ul className="mt-2 grid gap-x-6 sm:grid-cols-2">
          {departements.map((d) => (
            <li
              key={d.code}
              className="flex flex-wrap items-center justify-between gap-x-3 border-b text-sm"
            >
              <Link
                href={territoireDepartementPath(d.slug)}
                prefetch={false}
                className="inline-flex min-h-11 items-center font-medium underline underline-offset-2 hover:text-primary"
              >
                {d.name} ({d.code})
              </Link>
              <span className="py-1 text-right text-muted-foreground">{tallyEnMots(d)}</span>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
