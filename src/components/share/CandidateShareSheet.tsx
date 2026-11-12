"use client";

import { useMemo } from "react";
import type { ShareData } from "@/lib/share";
import { pickCardStats, shareCardFileName, type CardStat } from "@/lib/share-card";
import { formatDate } from "@/lib/utils";
import { ShareSheet, type ShareSheetCard } from "./ShareSheet";
import { CARD_JUSTICE_NOTE, loadPortrait } from "./card-canvas";
import { drawCandidateCard } from "./draw-candidate-card";

interface CandidateShareSheetProps {
  slug: string;
  data: ShareData;
  fullName: string;
  partyLabel: string | null;
  photoUrl: string | null;
  /** ISO date of the first round, or null while it is not set. */
  round1Date: string | null;
  /** Every counter the fiche holds, zeros included: the card decides what it prints. */
  stats: readonly CardStat[];
  className?: string;
}

const MAX_STATS = 6;

/** Share sheet of a presidential candidacy fiche. */
export function CandidateShareSheet({
  slug,
  data,
  fullName,
  partyLabel,
  photoUrl,
  round1Date,
  stats,
  className,
}: CandidateShareSheetProps) {
  const card = useMemo<ShareSheetCard>(() => {
    const shown = pickCardStats(stats, MAX_STATS);
    const counters = shown.map((stat) => `${stat.value} ${stat.label}`).join(", ");
    return {
      fileName: shareCardFileName("candidat", slug),
      alt: `${fullName}${partyLabel ? `, ${partyLabel}` : ""}, élection présidentielle 2027.${counters ? ` Ce que Poligraph documente : ${counters}.` : ""} ${CARD_JUSTICE_NOTE}`,
      note: "L'image est datée du jour. Elle ne porte ni statut de candidature ni décompte judiciaire : la fiche les détaille avec leurs sources.",
      draw: async (ctx, fonts) => {
        const portrait = await loadPortrait(photoUrl);
        drawCandidateCard(
          ctx,
          {
            fullName,
            partyLabel,
            // Read when the card is drawn, so the image carries the day it was made.
            asOfLabel: formatDate(new Date()),
            round1Label: round1Date ? formatDate(new Date(round1Date)) : null,
            stats: shown,
          },
          fonts,
          portrait
        );
      },
    };
  }, [fullName, partyLabel, photoUrl, round1Date, slug, stats]);

  return (
    <ShareSheet
      label="Partager cette fiche"
      description="Partager cette fiche de candidature par une image, un réseau social ou son lien."
      data={data}
      card={card}
      className={className}
    />
  );
}
