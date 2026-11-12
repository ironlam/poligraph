"use client";

import { useMemo } from "react";
import type { ShareData } from "@/lib/share";
import { shareCardFileName } from "@/lib/share-card";
import { ShareSheet, type ShareSheetCard } from "./ShareSheet";
import { drawFactCheckCard, type FactCheckCardInput } from "./draw-factcheck-card";

interface FactCheckShareSheetProps {
  slug: string;
  data: ShareData;
  card: FactCheckCardInput;
  className?: string;
}

/** Share sheet of a fact-check page. */
export function FactCheckShareSheet({ slug, data, card, className }: FactCheckShareSheetProps) {
  const sheetCard = useMemo<ShareSheetCard>(
    () => ({
      fileName: shareCardFileName("factcheck", slug),
      alt: `Déclaration vérifiée${card.claimant ? ` de ${card.claimant}` : ""} : « ${card.claimText} » Verdict de ${card.source}, publié le ${card.publishedLabel} : ${card.verdictLabel}.`,
      note: "L'image nomme le média qui a rendu le verdict. Poligraph ne produit pas ses propres vérifications.",
      draw: (ctx, fonts) => drawFactCheckCard(ctx, card, fonts),
    }),
    [card, slug]
  );

  return (
    <ShareSheet
      label="Partager ce fact-check"
      description="Partager ce fact-check par une image, un réseau social ou son lien."
      data={data}
      card={sheetCard}
      className={className}
    />
  );
}
