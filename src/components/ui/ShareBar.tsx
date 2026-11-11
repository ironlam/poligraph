"use client";

import { useState } from "react";
import { toast } from "sonner";
import { buildShareUrl, type ShareData } from "@/lib/share";
import { cn } from "@/lib/utils";
import { Check, Copy, Share2 } from "lucide-react";
import { SHARE_PLATFORMS } from "./share-platforms";

interface ShareBarProps {
  data: ShareData;
}

export function ShareBar({ data }: ShareBarProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(data.url);
      setCopied(true);
      toast.success("Lien copié");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Impossible de copier le lien");
    }
  }

  const buttonClass =
    "inline-flex items-center justify-center h-10 w-10 rounded-full bg-background border shadow-sm hover:bg-muted transition-colors";

  return (
    <>
      {/* Desktop: vertical bar, left side */}
      <div
        className="hidden 2xl:flex fixed left-4 top-1/2 -translate-y-1/2 z-40 flex-col gap-2"
        role="group"
        aria-label="Partager cette page"
      >
        {SHARE_PLATFORMS.map(({ key, Icon, label }) => (
          <a
            key={key}
            href={buildShareUrl(key, data.text, data.url)}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClass}
            aria-label={label}
            title={label}
          >
            <Icon className="h-4 w-4" />
          </a>
        ))}
        <button
          type="button"
          onClick={handleCopy}
          className={buttonClass}
          aria-label="Copier le lien"
          title="Copier le lien"
        >
          {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>

      {/* lg to 2xl: horizontal bar, bottom. Below lg the tab bar owns the bottom edge and the
          header share button covers the action. */}
      <div
        className={cn(
          "hidden lg:flex 2xl:hidden fixed bottom-0 left-0 right-0 z-40",
          "items-center justify-center gap-3 px-4 py-3",
          "bg-background/95 backdrop-blur-sm border-t shadow-lg"
        )}
        role="group"
        aria-label="Partager cette page"
      >
        <Share2 className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
        {SHARE_PLATFORMS.map(({ key, Icon, label }) => (
          <a
            key={key}
            href={buildShareUrl(key, data.text, data.url)}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClass}
            aria-label={label}
            title={label}
          >
            <Icon className="h-4 w-4" />
          </a>
        ))}
        <button
          type="button"
          onClick={handleCopy}
          className={buttonClass}
          aria-label="Copier le lien"
          title="Copier le lien"
        >
          {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
    </>
  );
}
