"use client";

import { useMemo } from "react";
import type { ShareData } from "@/lib/share";
import { shareCardFileName, type VoteCardInput } from "@/lib/share-card";
import { ShareSheet, type ShareSheetCard } from "./ShareSheet";
import { drawVoteCard } from "./draw-vote-card";

interface VoteShareSheetProps {
  slug: string;
  data: ShareData;
  /** Null when the breakdown would mislead as a bar (motion de censure): links only then. */
  card: (VoteCardInput & { callToAction: string; source: string }) | null;
}

/** Share sheet of a scrutin. */
export function VoteShareSheet({ slug, data, card }: VoteShareSheetProps) {
  const sheetCard = useMemo<ShareSheetCard | null>(() => {
    if (!card) return null;
    return {
      fileName: shareCardFileName("vote", slug),
      alt: `${card.title}. ${card.adopted ? "Adopté" : "Rejeté"}, ${card.votesFor} pour, ${card.votesAgainst} contre, ${card.votesAbstain} abstentions. ${card.source}`,
      note: "L'image porte le résultat en toutes lettres, la date du scrutin et sa source officielle.",
      draw: (ctx, fonts) =>
        drawVoteCard(ctx, card, fonts, { callToAction: card.callToAction, source: card.source }),
    };
  }, [card, slug]);

  return (
    <ShareSheet
      label="Partager ce vote"
      description="Partager ce scrutin par une image, un réseau social ou son lien."
      data={data}
      card={sheetCard}
    />
  );
}
