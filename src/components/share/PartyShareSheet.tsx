"use client";

import { useMemo } from "react";
import type { ShareData } from "@/lib/share";
import { pickCardStats, shareCardFileName, type CardStat } from "@/lib/share-card";
import { formatDate } from "@/lib/utils";
import { ShareSheet, type ShareSheetCard } from "./ShareSheet";
import { loadPortrait } from "./card-canvas";
import { drawPartyCard } from "./draw-party-card";

interface PartyShareSheetProps {
  slug: string;
  data: ShareData;
  name: string;
  subline: string;
  color: string | null;
  leader: { fullName: string; role: string; photoUrl: string | null } | null;
  /** Every counter the page holds, zeros included: the card decides what it prints. */
  stats: readonly CardStat[];
  className?: string;
}

const MAX_STATS = 4;

/** Share sheet of a party page. */
export function PartyShareSheet({
  slug,
  data,
  name,
  subline,
  color,
  leader,
  stats,
  className,
}: PartyShareSheetProps) {
  const card = useMemo<ShareSheetCard>(() => {
    const shown = pickCardStats(stats, MAX_STATS);
    const counters = shown.map((stat) => `${stat.value} ${stat.label}`).join(", ");
    return {
      fileName: shareCardFileName("parti", slug),
      alt: `${name}, ${subline}.${leader ? ` ${leader.role} : ${leader.fullName}.` : ""}${counters ? ` ${counters}.` : ""}`,
      note: "L'image est datée du jour. Elle ne porte aucun décompte judiciaire : la page du parti détaille chaque affaire avec son statut.",
      draw: async (ctx, fonts) => {
        const portrait = await loadPortrait(leader?.photoUrl ?? null);
        drawPartyCard(
          ctx,
          {
            name,
            subline,
            color,
            leader: leader && { fullName: leader.fullName, role: leader.role },
            stats: shown,
            // Read when the card is drawn, so the image carries the day it was made.
            asOfLabel: formatDate(new Date()),
          },
          fonts,
          portrait
        );
      },
    };
  }, [color, leader, name, slug, stats, subline]);

  return (
    <ShareSheet
      label="Partager cette fiche"
      description="Partager cette fiche de parti par une image, un réseau social ou son lien."
      data={data}
      card={card}
      className={className}
    />
  );
}
