import Link from "next/link";
import { Scale, Landmark, Vote, ArrowRight } from "lucide-react";
import { PoliticianAvatar } from "@/components/politicians/PoliticianAvatar";
import { AffairPartyChip } from "@/components/affairs/AffairPartyChip";

/**
 * Context band under the <h1>: who the tracked politician is, and the lateral
 * journeys a reader wants next (their affairs, their party's affairs, their
 * votes). Turns the fiche from a cul-de-sac into a crossroads.
 *
 * This is the identity étage of the InvolvementBand pattern. B1 will add the
 * role étage (the "ni mis en cause, ni poursuivi" sentence + not_accused notice)
 * below the identity row for non-accused involvements, without reshaping this.
 */
interface AffairContextBandProps {
  politicianSlug: string;
  fullName: string;
  photoUrl: string | null;
  /** Mandate · chamber · seniority, pre-formatted; omitted when unknown. */
  meta: string | null;
  affairCount: number;
  party: {
    name: string;
    shortName: string;
    color: string | null;
    slug: string | null;
    atTime: boolean;
  } | null;
}

function RailLink({
  href,
  icon: Icon,
  children,
}: {
  href: string;
  icon: typeof Scale;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-11 items-center gap-1.5 rounded-md border bg-card px-3 text-sm font-medium outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
    >
      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      {children}
      <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
    </Link>
  );
}

export function AffairContextBand({
  politicianSlug,
  fullName,
  photoUrl,
  meta,
  affairCount,
  party,
}: AffairContextBandProps) {
  const ficheHref = `/politiques/${politicianSlug}`;
  const votesHref = `/politiques/${politicianSlug}/votes`;
  const partyAffairsHref = party?.slug ? `/affaires/parti/${party.slug}` : null;

  return (
    <div className="mb-6 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href={ficheHref}
            className="shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <PoliticianAvatar fullName={fullName} photoUrl={photoUrl} size="md" />
          </Link>
          <div>
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <Link
                href={ficheHref}
                className="font-display text-lg font-semibold text-primary underline-offset-2 hover:underline"
              >
                {fullName}
              </Link>
              <Link
                href={ficheHref}
                className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                Fiche complète
                <ArrowRight className="ml-0.5 inline size-3" aria-hidden="true" />
              </Link>
            </div>
            {meta && <p className="mt-0.5 text-sm text-muted-foreground">{meta}</p>}
          </div>
        </div>

        {party && (
          <AffairPartyChip
            name={party.name}
            shortName={party.shortName}
            color={party.color}
            href={partyAffairsHref ?? undefined}
            atTime={party.atTime}
          />
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2 border-t pt-3">
        <RailLink href={ficheHref} icon={Scale}>
          {affairCount > 1 ? `Ses ${affairCount} affaires documentées` : "Sa fiche d'affaires"}
        </RailLink>
        {partyAffairsHref && (
          <RailLink href={partyAffairsHref} icon={Landmark}>
            Affaires {party?.shortName}
          </RailLink>
        )}
        <RailLink href={votesHref} icon={Vote}>
          Ses votes
        </RailLink>
      </div>
    </div>
  );
}
