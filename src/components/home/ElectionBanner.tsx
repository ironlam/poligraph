import Link from "next/link";
import { Landmark, Building2, Map, Stars, Vote, ChevronRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ElectionType } from "@/generated/prisma";

interface FeaturedElection {
  slug: string;
  title: string;
  shortTitle: string | null;
  type: ElectionType;
  round1Date: Date | null;
  hasResults: boolean;
  communesDepouillees: number;
}

interface ElectionBannerProps {
  election: FeaturedElection;
  daysUntil: number | null;
}

const ELECTION_TYPE_LUCIDE: Record<ElectionType, LucideIcon> = {
  PRESIDENTIELLE: Landmark,
  LEGISLATIVES: Landmark,
  SENATORIALES: Landmark,
  MUNICIPALES: Building2,
  DEPARTEMENTALES: Map,
  REGIONALES: Map,
  EUROPEENNES: Stars,
  REFERENDUM: Vote,
};

export function ElectionBanner({ election, daysUntil }: ElectionBannerProps) {
  const Icon = ELECTION_TYPE_LUCIDE[election.type];

  return (
    <Link
      href={`/elections/${election.slug}`}
      prefetch={false}
      className="group flex items-center gap-3 rounded-xl border bg-card p-4 transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold leading-tight">
          {election.shortTitle || election.title}
        </div>
        {(daysUntil !== null && daysUntil > 0) || election.hasResults ? (
          <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
            {daysUntil !== null && daysUntil > 0 && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary">
                J-{daysUntil}
              </span>
            )}
            {election.hasResults && <span>Résultats disponibles</span>}
          </div>
        ) : null}
      </div>
      <ChevronRight
        className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
        aria-hidden="true"
      />
    </Link>
  );
}
