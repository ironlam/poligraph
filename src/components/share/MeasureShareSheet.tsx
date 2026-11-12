"use client";

import { useMemo } from "react";
import type { ShareData } from "@/lib/share";
import { shareCardFileName } from "@/lib/share-card";
import { formatDate } from "@/lib/utils";
import { ShareSheet, type ShareSheetCard } from "./ShareSheet";
import { drawMeasureCard, type MeasureCardInput } from "./draw-measure-card";

interface MeasureShareSheetProps {
  slug: string;
  data: ShareData;
  /** Null when the measure has no source to print: the sheet then offers the link alone. */
  card: Omit<MeasureCardInput, "asOfLabel"> | null;
  className?: string;
}

/** Share sheet of one measure of a presidential programme. */
export function MeasureShareSheet({ slug, data, card, className }: MeasureShareSheetProps) {
  const sheetCard = useMemo<ShareSheetCard | null>(() => {
    if (!card) return null;
    const sources = card.sourceCount > 1 ? `, ${card.sourceCount} sources au total` : "";
    return {
      fileName: shareCardFileName("mesure", slug),
      alt: `Ce que propose ${card.candidateName} sur le thème ${card.themeLabel} : ${card.text} ${card.sourceLine}${sources}. ${card.attributionLabel}.`,
      note: "L'image reprend le texte publié, sa source et la date du jour, sans commentaire.",
      // The date is read when the card is drawn, so the image carries the day it was made.
      draw: (ctx, fonts) =>
        drawMeasureCard(ctx, { ...card, asOfLabel: formatDate(new Date()) }, fonts),
    };
  }, [card, slug]);

  return (
    <ShareSheet
      label="Partager cette mesure"
      description="Partager cette mesure par une image, un réseau social ou son lien."
      data={data}
      card={sheetCard}
      className={className}
    />
  );
}
