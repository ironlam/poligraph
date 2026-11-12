"use client";

import { useMemo } from "react";
import type { AffairCardInput } from "@/lib/affairs/share-card";
import type { ShareData } from "@/lib/share";
import { shareCardFileName } from "@/lib/share-card";
import { formatDate } from "@/lib/utils";
import { ShareSheet, type ShareSheetCard } from "./ShareSheet";
import { drawAffairCard } from "./draw-affair-card";

interface AffairShareSheetProps {
  slug: string;
  data: ShareData;
  /** Null whenever `buildAffairShareCard` refused one: the affair is then shared by link only. */
  card: AffairCardInput | null;
  className?: string;
}

/** Share sheet of a judicial affair. */
export function AffairShareSheet({ slug, data, card, className }: AffairShareSheetProps) {
  const sheetCard = useMemo<ShareSheetCard | null>(() => {
    if (!card) return null;
    const step = card.stepLabel ? `, étape : ${card.stepLabel}` : "";
    const party = card.partyAtTime ? ` (${card.partyAtTime}, au moment des faits)` : "";
    const sentence = card.sentence ? ` Peine prononcée : ${card.sentence}.` : "";
    return {
      fileName: shareCardFileName("affaire", slug),
      alt: `${card.certaintyLabel}${step}. ${card.title}. ${card.roleLabel} : ${card.fullName}${party}. ${card.notice}${sentence} Faits qualifiés : ${card.categoryLabel}.`,
      note: "L'image porte le statut en toutes lettres, daté du jour, et la présomption d'innocence quand elle s'applique. Elle ne montre pas de portrait.",
      // The date is read when the card is drawn: a judicial status is only true on a given day.
      draw: (ctx, fonts) => drawAffairCard(ctx, card, fonts, formatDate(new Date())),
    };
  }, [card, slug]);

  return (
    <ShareSheet
      label="Partager cette affaire"
      description="Partager cette affaire par une image, un réseau social ou son lien."
      data={data}
      card={sheetCard}
      className={className}
    />
  );
}
