"use client";

import { useMemo } from "react";
import type { ShareData } from "@/lib/share";
import { pickCardStats, shareCardFileName, type CardStat } from "@/lib/share-card";
import { formatDate } from "@/lib/utils";
import { ShareSheet, type ShareSheetCard } from "./ShareSheet";
import { CARD_JUSTICE_NOTE, loadPortrait, type VoteCounts } from "./card-canvas";
import { drawPoliticianCard } from "./draw-politician-card";

interface PoliticianShareSheetProps {
  slug: string;
  data: ShareData;
  fullName: string;
  mandateLabel: string | null;
  partyLabel: string | null;
  photoUrl: string | null;
  /** Null, or all zeros, when the person has no recorded vote: the block is then left out. */
  votes: VoteCounts | null;
  /** Every counter the fiche holds, zeros included: the card decides what it prints. */
  stats: readonly CardStat[];
  className?: string;
}

const MAX_STATS = 3;

/** Share sheet of a politician's fiche. */
export function PoliticianShareSheet({
  slug,
  data,
  fullName,
  mandateLabel,
  partyLabel,
  photoUrl,
  votes,
  stats,
  className,
}: PoliticianShareSheetProps) {
  const card = useMemo<ShareSheetCard>(() => {
    const shown = pickCardStats(stats, MAX_STATS);
    const cast = votes ? votes.votesFor + votes.votesAgainst + votes.votesAbstain : 0;
    const shownVotes = votes && cast > 0 ? votes : null;
    const who = [fullName, mandateLabel, partyLabel].filter(Boolean).join(", ");
    const voted = shownVotes
      ? ` Ses votes enregistrés au Parlement : ${shownVotes.votesFor} pour, ${shownVotes.votesAgainst} contre, ${shownVotes.votesAbstain} abstentions.`
      : "";
    const counters = shown.map((stat) => `${stat.value} ${stat.label}`).join(", ");
    return {
      fileName: shareCardFileName("elu", slug),
      alt: `${who}.${voted}${counters ? ` Ce que Poligraph documente : ${counters}.` : ""} ${CARD_JUSTICE_NOTE}`,
      note: "L'image est datée du jour. Elle ne porte aucun décompte judiciaire : la fiche détaille chaque procédure avec son statut et ses sources.",
      draw: async (ctx, fonts) => {
        const portrait = await loadPortrait(photoUrl);
        drawPoliticianCard(
          ctx,
          {
            fullName,
            mandateLabel,
            partyLabel,
            votes: shownVotes,
            stats: shown,
            // Read when the card is drawn, so the image carries the day it was made.
            asOfLabel: formatDate(new Date()),
          },
          fonts,
          portrait
        );
      },
    };
  }, [fullName, mandateLabel, partyLabel, photoUrl, slug, stats, votes]);

  return (
    <ShareSheet
      label="Partager cette fiche"
      description="Partager cette fiche par une image, un réseau social ou son lien."
      data={data}
      card={card}
      className={className}
    />
  );
}
