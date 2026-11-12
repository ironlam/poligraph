"use client";

import { useMemo } from "react";
import type { ShareData } from "@/lib/share";
import { formatCardStat, shareCardFileName, type CardStat } from "@/lib/share-card";
import { formatDate } from "@/lib/utils";
import { ShareSheet, type ShareSheetCard } from "./ShareSheet";
import { drawGroupCard } from "./draw-group-card";

interface GroupShareSheetProps {
  slug: string;
  data: ShareData;
  name: string;
  subline: string;
  color: string | null;
  seatCount: number;
  indicators: readonly CardStat[];
  scope: string;
  className?: string;
}

/** Share sheet of a parliamentary group page. */
export function GroupShareSheet({
  slug,
  data,
  name,
  subline,
  color,
  seatCount,
  indicators,
  scope,
  className,
}: GroupShareSheetProps) {
  const card = useMemo<ShareSheetCard | null>(() => {
    const members =
      seatCount > 0 ? { value: seatCount, label: seatCount > 1 ? "membres" : "membre" } : null;
    // A name alone is not worth an image: the sheet then offers the link only.
    if (!members && indicators.length === 0) return null;
    const stats = [members, ...indicators].filter((stat): stat is CardStat => stat !== null);
    const counters = stats.map((stat) => `${formatCardStat(stat)} ${stat.label}`).join(", ");
    return {
      fileName: shareCardFileName("groupe", slug),
      alt: `${name}, ${subline}.${counters ? ` ${counters}.` : ""} ${scope}`,
      note: "L'image est datée du jour et précise la chambre, la législature et ce que mesurent ses pourcentages.",
      draw: (ctx, fonts) =>
        drawGroupCard(
          ctx,
          {
            name,
            subline,
            color,
            members,
            indicators,
            scope,
            // Read when the card is drawn, so the image carries the day it was made.
            asOfLabel: formatDate(new Date()),
          },
          fonts
        ),
    };
  }, [color, indicators, name, scope, seatCount, slug, subline]);

  return (
    <ShareSheet
      label="Partager ce groupe"
      description="Partager ce groupe parlementaire par une image, un réseau social ou son lien."
      data={data}
      card={card}
      className={className}
    />
  );
}
