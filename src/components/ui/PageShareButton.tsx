"use client";

import { Share2 } from "lucide-react";
import { toast } from "sonner";
import { shareOrCopy } from "@/lib/share";
import { cn } from "@/lib/utils";

/**
 * Header action that shares the current page, filters included. Lives in the
 * header so that every page is shareable, including in an installed PWA where
 * the browser's own share entry does not exist.
 */
export function PageShareButton({ className }: { className?: string }) {
  async function handleClick() {
    const outcome = await shareOrCopy({ title: document.title, url: window.location.href });
    if (outcome === "copied") toast.success("Lien copié");
    if (outcome === "failed") toast.error("Impossible de partager le lien");
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "flex items-center justify-center h-11 w-11 lg:h-10 lg:w-10 rounded-lg text-foreground/70 hover:text-foreground hover:bg-muted/50 transition-colors",
        className
      )}
      aria-label="Partager cette page"
      title="Partager cette page"
    >
      <Share2 className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}
