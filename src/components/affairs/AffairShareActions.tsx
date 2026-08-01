"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Link2, Check, Share2 } from "lucide-react";

/**
 * Citer / Partager actions for the sticky bar, folded in from the former
 * floating ShareBar (whose fixed bottom bar clashed with the mobile action
 * bar). No searchParams read, so it needs no Suspense boundary. Partager uses
 * the native share sheet where available (mobile), copy elsewhere.
 */
interface AffairShareActionsProps {
  title: string;
  shareUrl: string;
  shareText: string;
}

const ACTION_CLASS =
  "inline-flex min-h-11 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1";

export function AffairShareActions({ title, shareUrl, shareText }: AffairShareActionsProps) {
  const [copied, setCopied] = useState(false);

  async function handleCite() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success("Lien de l'affaire copié");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Impossible de copier le lien");
    }
  }

  async function handleShare() {
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ title, text: shareText, url: shareUrl });
        return;
      } catch {
        // Cancelled or unsupported: fall through to copy.
      }
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Lien copié, à coller où vous voulez");
    } catch {
      toast.error("Impossible de partager le lien");
    }
  }

  return (
    <>
      <button type="button" onClick={handleCite} aria-label="Citer" className={ACTION_CLASS}>
        {copied ? (
          <Check className="size-4 shrink-0 text-emerald-600" aria-hidden="true" />
        ) : (
          <Link2 className="size-4 shrink-0" aria-hidden="true" />
        )}
        <span className="hidden sm:inline">Citer</span>
      </button>
      <button type="button" onClick={handleShare} aria-label="Partager" className={ACTION_CLASS}>
        <Share2 className="size-4 shrink-0" aria-hidden="true" />
        <span className="hidden sm:inline">Partager</span>
      </button>
    </>
  );
}
