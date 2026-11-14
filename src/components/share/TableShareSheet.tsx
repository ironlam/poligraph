"use client";

import { useMemo } from "react";
import type { ShareData } from "@/lib/share";
import { shareCardFileName, type TableCardInput } from "@/lib/share-card";
import { formatDate } from "@/lib/utils";
import { ShareSheet, type ShareSheetCard } from "./ShareSheet";
import { drawTableCard, tableCardFits } from "./draw-table-card";

interface TableShareSheetProps {
  slug: string;
  /** Label of the button and title of the sheet. */
  label: string;
  data: ShareData;
  /** The table to print. Its `context` receives the date of the day the card is made. */
  table: TableCardInput;
  className?: string;
}

/**
 * Share sheet of a table comparing parties. The image is offered only when the whole table fits:
 * otherwise the page is shared by its link, never by a truncated card.
 */
export function TableShareSheet({ slug, label, data, table, className }: TableShareSheetProps) {
  const card = useMemo<ShareSheetCard | null>(() => {
    if (!tableCardFits(table.rows.length)) return null;
    const rows = table.rows
      .map((row) => `${row.label} : ${row.detail}${row.value ? `, ${row.value}` : ""}`)
      .join(" ; ");
    return {
      fileName: shareCardFileName("stat", slug),
      alt: `${table.title}. ${table.subtitle} ${rows}. ${table.note}`,
      note: "L'image reprend le tableau entier, dans l'ordre de la page, avec sa méthode et la date du jour.",
      // Dated when drawn: a comparison is only true on the day it was read.
      draw: (ctx, fonts) =>
        drawTableCard(
          ctx,
          { ...table, context: `${table.context} · au ${formatDate(new Date())}` },
          fonts
        ),
    };
  }, [slug, table]);

  return (
    <ShareSheet
      label={label}
      description="Partager ce tableau par une image, un réseau social ou son lien."
      data={data}
      card={card}
      className={className}
    />
  );
}
