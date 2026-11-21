import Link from "next/link";
import type { PresidentialAffairsCandidateFacet } from "@/lib/data/presidentielle-affaires";
import {
  PRESIDENTIAL_AFFAIRS_SORTS,
  PRESIDENTIAL_AFFAIRS_SORT_LABELS,
  buildPresidentialAffairsHref,
  type PresidentialAffairsState,
} from "@/lib/presidentielle/affaires-listing";

export function PresidentialAffairsFilters({
  candidates,
  current,
  total,
}: {
  candidates: PresidentialAffairsCandidateFacet[];
  current: PresidentialAffairsState;
  total: number;
}) {
  const allCount = candidates.reduce((sum, candidate) => sum + candidate.count, 0) || total;

  return (
    <div className="space-y-2 md:space-y-3" role="group" aria-label="Filtrer et trier les affaires">
      <ChipRow legend="Candidat">
        <Chip
          href={buildPresidentialAffairsHref({ candidat: null, tri: current.tri })}
          active={current.candidat === null}
        >
          Tous <span className="text-muted-foreground">({allCount})</span>
        </Chip>
        {candidates.map((candidate) => (
          <Chip
            key={candidate.slug}
            href={buildPresidentialAffairsHref({ candidat: candidate.slug, tri: current.tri })}
            active={current.candidat === candidate.slug}
          >
            {candidate.fullName} <span className="text-muted-foreground">({candidate.count})</span>
          </Chip>
        ))}
      </ChipRow>
      {/* Sorting one person's handful of affairs by person is meaningless. */}
      <ChipRow legend="Trier">
        {PRESIDENTIAL_AFFAIRS_SORTS.filter((key) => !(current.candidat && key === "candidat")).map(
          (key) => (
            <Chip
              key={key}
              href={buildPresidentialAffairsHref({ candidat: current.candidat, tri: key })}
              active={current.tri === key}
            >
              {PRESIDENTIAL_AFFAIRS_SORT_LABELS[key]}
            </Chip>
          )
        )}
      </ChipRow>
    </div>
  );
}

function ChipRow({ legend, children }: { legend: string; children: React.ReactNode }) {
  return (
    <fieldset>
      <legend className="mb-1 text-xs font-medium text-muted-foreground">{legend}</legend>
      {/* Below md a row scrolls sideways: stacked wrapping chips pushed the list off the first screen. */}
      <div
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:overflow-visible md:px-0"
        role="radiogroup"
        aria-label={legend}
      >
        {children}
      </div>
    </fieldset>
  );
}

function Chip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      role="radio"
      aria-checked={active}
      scroll={false}
      prefetch={false}
      className={`inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full border px-4 text-sm transition-colors hover:bg-muted ${
        active ? "border-primary bg-primary/10 font-medium" : ""
      }`}
    >
      {children}
    </Link>
  );
}
