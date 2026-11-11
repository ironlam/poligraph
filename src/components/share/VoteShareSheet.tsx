"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, Copy, Download, Share2, X } from "lucide-react";
import { toast } from "sonner";
import { SHARE_PLATFORMS } from "@/components/ui/share-platforms";
import { buildShareUrl, shareOrCopy, type ShareData } from "@/lib/share";
import { voteCardFileName, type VoteCardInput } from "@/lib/share-card";
import { cn } from "@/lib/utils";
import { VOTE_CARD_HEIGHT, VOTE_CARD_WIDTH, drawVoteCard } from "./draw-vote-card";

interface VoteShareSheetProps {
  slug: string;
  data: ShareData;
  /** Null when the breakdown would mislead as a bar (motion de censure): links only then. */
  card: (VoteCardInput & { callToAction: string; source: string }) | null;
}

const ACTION_CLASS =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring";

function cssFont(variable: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return value || "sans-serif";
}

function canvasToFile(canvas: HTMLCanvasElement, name: string): Promise<File | null> {
  return new Promise((resolve) =>
    canvas.toBlob((blob) => resolve(blob ? new File([blob], name, { type: "image/png" }) : null))
  );
}

/**
 * Share sheet of a scrutin. The card is drawn in the browser from data the page already holds:
 * no image route, so nothing for a crawler to fetch and nothing re-rendered on the server.
 */
export function VoteShareSheet({ slug, data, card }: VoteShareSheetProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!open || !card) return;
    let cancelled = false;
    // The dialog content mounts on open: wait for it, and for the fonts the card is set in.
    const frame = requestAnimationFrame(async () => {
      const fonts = { display: cssFont("--font-display"), body: cssFont("--font-body") };
      await Promise.all([
        document.fonts.load(`800 68px ${fonts.display}`),
        document.fonts.load(`400 30px ${fonts.body}`),
        document.fonts.load(`700 36px ${fonts.body}`),
      ]).catch(() => undefined);
      const ctx = canvasRef.current?.getContext("2d");
      if (cancelled || !ctx) return;
      drawVoteCard(ctx, card, fonts, { callToAction: card.callToAction, source: card.source });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [open, card]);

  const fileName = voteCardFileName(slug);

  const shareImage = useCallback(async () => {
    const canvas = canvasRef.current;
    const file = canvas ? await canvasToFile(canvas, fileName) : null;
    if (file && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: data.title, text: data.text, url: data.url });
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          toast.error("Impossible de partager l'image");
        }
      }
      return;
    }
    // No file sharing on this browser: fall back to the link.
    const outcome = await shareOrCopy(data);
    if (outcome === "copied") toast.success("Lien copié");
    if (outcome === "failed") toast.error("Impossible de partager le lien");
  }, [data, fileName]);

  const saveImage = useCallback(async () => {
    const canvas = canvasRef.current;
    const file = canvas ? await canvasToFile(canvas, fileName) : null;
    if (!file) {
      toast.error("Impossible d'enregistrer l'image");
      return;
    }
    const href = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = href;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(href);
  }, [fileName]);

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(data.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Impossible de copier le lien");
    }
  }, [data.url]);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button type="button" className={cn(ACTION_CLASS, "w-full px-4 sm:w-auto")}>
          <Share2 className="h-4 w-4" aria-hidden="true" />
          Partager ce vote
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=open]:fade-in-0 motion-reduce:animate-none" />
        <Dialog.Content
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 max-h-[90vh] overflow-y-auto rounded-t-xl border-t bg-background p-4 shadow-2xl",
            "sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl sm:border",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 motion-reduce:animate-none"
          )}
        >
          <div className="mb-3 flex items-center justify-between">
            <Dialog.Title className="font-display text-lg font-bold">Partager ce vote</Dialog.Title>
            <Dialog.Close
              aria-label="Fermer"
              className="flex min-h-11 min-w-11 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">
            Partager ce scrutin par une image, un réseau social ou son lien.
          </Dialog.Description>

          <div className="space-y-4">
            {card && (
              <>
                <canvas
                  ref={canvasRef}
                  width={VOTE_CARD_WIDTH}
                  height={VOTE_CARD_HEIGHT}
                  role="img"
                  aria-label={`Image à partager : ${card.title}. ${card.adopted ? "Adopté" : "Rejeté"}, ${card.votesFor} pour, ${card.votesAgainst} contre, ${card.votesAbstain} abstentions. ${card.source}`}
                  className="mx-auto block h-auto w-44 rounded-lg border"
                />
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={shareImage}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground outline-none hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                  >
                    <Share2 className="h-4 w-4" aria-hidden="true" />
                    Partager l{"'"}image
                  </button>
                  <button type="button" onClick={saveImage} className={ACTION_CLASS}>
                    <Download className="h-4 w-4" aria-hidden="true" />
                    Enregistrer
                  </button>
                </div>
              </>
            )}

            <div className="grid grid-cols-4 gap-2" role="group" aria-label="Partager le lien sur">
              {SHARE_PLATFORMS.map(({ key, Icon, label }) => (
                <a
                  key={key}
                  href={buildShareUrl(key, data.text, data.url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${label} (nouvel onglet)`}
                  title={label}
                  className={ACTION_CLASS}
                >
                  <Icon className="h-5 w-5" />
                </a>
              ))}
            </div>

            <button type="button" onClick={copyLink} className={cn(ACTION_CLASS, "w-full")}>
              {copied ? (
                <Check className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Copy className="h-4 w-4" aria-hidden="true" />
              )}
              {copied ? "Lien copié" : "Copier le lien"}
            </button>

            {card && (
              <p className="text-xs text-muted-foreground">
                L{"'"}image porte le résultat en toutes lettres, la date du scrutin et sa source
                officielle.
              </p>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
