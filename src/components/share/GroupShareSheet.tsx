"use client";

import { useMemo } from "react";
import type { ShareData } from "@/lib/share";
import {
  formatCardStat,
  seatSharePct,
  shareCardFileName,
  type CardStat,
  type HemicyclePlacement,
} from "@/lib/share-card";
import { formatDate } from "@/lib/utils";
import { ShareSheet, type ShareSheetCard } from "./ShareSheet";
import { loadPortrait } from "./card-canvas";
import { drawGroupCard } from "./draw-group-card";

interface GroupShareSheetProps {
  slug: string;
  data: ShareData;
  name: string;
  subline: string;
  color: string | null;
  /** Who presides the group, with the function already agreed and dated. Null when unknown. */
  president: { fullName: string; role: string; photoUrl: string | null } | null;
  seatCount: number;
  /** Null for a group with no declared place on the benches: no hemicycle is drawn then. */
  hemicycle: { placement: HemicyclePlacement; seatNoun: string } | null;
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
  president,
  seatCount,
  hemicycle,
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
    const share = hemicycle
      ? ` ${hemicycle.placement.seats} ${hemicycle.seatNoun} sur ${hemicycle.placement.total}, soit ${seatSharePct(hemicycle.placement)} % des sièges pourvus, montrés dans un hémicycle.`
      : "";
    return {
      fileName: shareCardFileName("groupe", slug),
      alt: `${name}, ${subline}.${president ? ` ${president.role} : ${president.fullName}.` : ""}${counters ? ` ${counters}.` : ""}${share} ${scope}`,
      note: "L'image est datée du jour et précise la chambre, la législature et ce que mesurent ses pourcentages.",
      draw: async (ctx, fonts) => {
        const portrait = await loadPortrait(president?.photoUrl ?? null);
        drawGroupCard(
          ctx,
          {
            name,
            subline,
            color,
            president: president && { fullName: president.fullName, role: president.role },
            members,
            hemicycle,
            indicators,
            scope,
            // Read when the card is drawn, so the image carries the day it was made.
            asOfLabel: formatDate(new Date()),
          },
          fonts,
          portrait
        );
      },
    };
  }, [color, hemicycle, indicators, name, president, scope, seatCount, slug, subline]);

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
