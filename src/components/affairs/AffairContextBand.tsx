import Link from "next/link";
import { Scale, Landmark, Vote, ArrowRight, Info } from "lucide-react";
import { PoliticianAvatar } from "@/components/politicians/PoliticianAvatar";
import { AffairPartyChip } from "@/components/affairs/AffairPartyChip";
import { isAccusedInvolvement } from "@/config/certainty";
import { getRoleNoticeCopy } from "@/lib/affairs/role-notice";
import type { Involvement } from "@/types";

/**
 * Context band under the <h1>: who the tracked politician is, and the lateral
 * journeys a reader wants next (their affairs, their party's affairs, their
 * votes). Turns the fiche from a cul-de-sac into a crossroads.
 *
 * It is the InvolvementBand pattern. For a non-accused involvement it carries a
 * role étage (the "ni mise en cause, ni poursuivie" sentence, or the sourced
 * involvementNote when present). When subjectLabel names who the procedure
 * really targets, the identity étage splits into two columns: "Visé par la
 * procédure" (the subject) and "Suivi sur cette page" (the tracked person).
 */
type SubjectKind = "PERSON" | "ORGANISATION" | "UNKNOWN";

const SUBJECT_KIND_LABELS: Record<SubjectKind, string> = {
  PERSON: "Personne",
  ORGANISATION: "Personne morale (hors périmètre Poligraph)",
  UNKNOWN: "Sujet non déterminé",
};

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
  /** Drives the role étage: for a non-accused involvement the band states, in a
      sentence, that the person is neither mise en cause nor poursuivie (I3, I5). */
  involvement: Involvement;
  /** Who/what the procedure really targets, when it is not the tracked person. */
  subjectLabel: string | null;
  subjectKind: SubjectKind | null;
  subjectNote: string | null;
  /** Sourced nature of the link; replaces the generic role sentence when set. */
  involvementNote: string | null;
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
  involvement,
  subjectLabel,
  subjectKind,
  subjectNote,
  involvementNote,
}: AffairContextBandProps) {
  const ficheHref = `/politiques/${politicianSlug}`;
  const votesHref = `/politiques/${politicianSlug}/votes`;
  const partyAffairsHref = party?.slug ? `/affaires/parti/${party.slug}` : null;
  const accused = isAccusedInvolvement(involvement);
  const roleCopy = accused ? null : getRoleNoticeCopy(involvement);
  // The sourced note is more specific than the generic role sentence.
  const rolePosition = involvementNote?.trim() || roleCopy?.position;

  const identity = (
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
  );

  const partyChip = party ? (
    <AffairPartyChip
      name={party.name}
      shortName={party.shortName}
      color={party.color}
      href={partyAffairsHref ?? undefined}
      atTime={party.atTime}
    />
  ) : null;

  return (
    <div className="mb-6 rounded-xl border bg-card p-4">
      {subjectLabel ? (
        // Two columns: name the real subject without confusing it with the
        // tracked person (the only layout that does both).
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border bg-muted/40 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Visé par la procédure
            </p>
            <p className="mt-1 font-semibold text-foreground">{subjectLabel}</p>
            {subjectKind && (
              <p className="text-sm text-muted-foreground">{SUBJECT_KIND_LABELS[subjectKind]}</p>
            )}
            {subjectNote && <p className="mt-0.5 text-sm text-muted-foreground">{subjectNote}</p>}
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Suivi sur cette page
            </p>
            <div className="mt-1">{identity}</div>
            <p className="mt-1 text-sm text-muted-foreground">
              Non poursuivi · aucune peine encourue
            </p>
            {partyChip && <div className="mt-2">{partyChip}</div>}
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-start justify-between gap-4">
          {identity}
          {partyChip}
        </div>
      )}

      {roleCopy && (
        <div
          role="note"
          data-variant="not_accused"
          className="mt-3 flex gap-2 rounded-lg border bg-slate-50 p-3 text-slate-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-200"
        >
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div className="text-sm">
            <p>
              <strong>Son rôle dans cette affaire : {roleCopy.roleLabel}.</strong> {rolePosition}{" "}
              {roleCopy.reminder}
            </p>
            <Link
              href="/methodologie"
              className="mt-1 inline-flex items-center font-medium text-primary hover:underline"
            >
              Que veulent dire «&nbsp;mis en cause&nbsp;», «&nbsp;mentionné&nbsp;»,
              «&nbsp;victime&nbsp;»&nbsp;?
              <ArrowRight className="ml-0.5 size-3" aria-hidden="true" />
            </Link>
          </div>
        </div>
      )}

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
