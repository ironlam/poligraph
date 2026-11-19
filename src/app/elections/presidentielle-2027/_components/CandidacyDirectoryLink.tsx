"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { PoliticianAvatar } from "@/components/politicians/PoliticianAvatar";
import type { HubCandidacy } from "@/lib/data/hub";
import { CandidacyStatusBadge } from "./CandidacyStatusBadge";
import { PartyLogo } from "./PartyLogo";

function publishedContentLabel(candidacy: HubCandidacy): string {
  if (candidacy.measureCount > 0) {
    const measures = `${candidacy.measureCount} ${
      candidacy.measureCount === 1 ? "mesure" : "mesures"
    }`;
    const themes = `${candidacy.themesCoveredCount} ${
      candidacy.themesCoveredCount === 1 ? "thème" : "thèmes"
    }`;
    return `${measures} · ${themes}`;
  }
  return candidacy.programmeAbsence === "non_depouille"
    ? "Programme repéré, traitement en cours"
    : "Programme non trouvé ou pas encore traité";
}

export function CandidacyDirectoryLink({
  candidacy,
  onNavigate,
}: {
  candidacy: HubCandidacy;
  onNavigate?: () => void;
}) {
  return (
    // Below sm: a smaller portrait and no chevron, so the status and the measure count share one
    // line and three candidacies fit on a phone screen instead of two.
    <Link
      href={`/elections/presidentielle-2027/candidats/${candidacy.politicianSlug}`}
      prefetch={false}
      onClick={onNavigate}
      className="group grid h-full grid-cols-[2.75rem_minmax(0,1fr)] items-center gap-3 rounded-2xl border border-border bg-card p-2.5 sm:min-h-24 sm:grid-cols-[3.5rem_minmax(0,1fr)_1.25rem] sm:p-3 transition-colors hover:border-primary hover:bg-muted/40 active:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none"
    >
      <span aria-hidden="true" className="shrink-0">
        <PoliticianAvatar
          photoUrl={candidacy.photoUrl}
          blobPhotoUrl={candidacy.blobPhotoUrl}
          fullName={candidacy.candidateName}
          size="md"
          className="h-11 w-11 sm:h-14 sm:w-14"
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block break-words font-display text-base font-extrabold leading-tight">
          {candidacy.candidateName}
        </span>
        {candidacy.partyLabel && (
          <span className="mt-1 grid grid-cols-[1.5rem_minmax(0,1fr)] items-center gap-1.5 text-sm font-semibold leading-snug text-foreground">
            <PartyLogo
              logoUrl={candidacy.partyLogoUrl}
              label={candidacy.partyLabel}
              shortName={candidacy.partyShortName}
              color={candidacy.partyColor}
            />
            <span>{candidacy.partyLabel}</span>
          </span>
        )}
        <span className="mt-1 flex flex-wrap items-center gap-x-1.5 sm:mt-2 sm:gap-y-1.5">
          <CandidacyStatusBadge
            status={candidacy.status}
            withdrewReason={candidacy.withdrewReason}
          />
          <span className="text-xs leading-snug text-muted-foreground-strong">
            {publishedContentLabel(candidacy)}
          </span>
        </span>
      </span>
      <ChevronRight
        aria-hidden="true"
        className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none max-sm:hidden"
      />
    </Link>
  );
}
