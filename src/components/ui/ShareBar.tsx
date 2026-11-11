"use client";

import { useState } from "react";
import { toast } from "sonner";
import { buildShareUrl, type ShareData } from "@/lib/share";
import { cn } from "@/lib/utils";
import { Check, Copy, Share2 } from "lucide-react";

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function BlueskyIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 568 501" className={className} fill="currentColor" aria-hidden="true">
      <path d="M123.121 33.6637C188.241 82.5526 258.281 181.681 284 234.873C309.719 181.681 379.759 82.5526 444.879 33.6637C491.866 -1.61183 568 -28.9064 568 57.9464C568 75.2916 558.055 203.659 552.222 224.501C531.947 296.954 458.067 315.434 392.347 304.249C507.222 323.8 536.444 388.56 473.333 453.32C353.473 576.312 301.061 422.461 287.631 383.039C285.169 375.812 284.017 372.431 284 375.306C283.983 372.431 282.831 375.812 280.369 383.039C266.939 422.461 214.527 576.312 94.6667 453.32C31.5556 388.56 60.7778 323.8 175.653 304.249C109.933 315.434 36.0529 296.954 15.7778 224.501C9.94444 203.659 0 75.2916 0 57.9464C0 -28.9064 76.1345 -1.61183 123.121 33.6637Z" />
    </svg>
  );
}

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 7.452 7.452 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z" />
    </svg>
  );
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
    </svg>
  );
}

const PLATFORMS = [
  { key: "x" as const, Icon: XIcon, label: "Partager sur X" },
  { key: "bluesky" as const, Icon: BlueskyIcon, label: "Partager sur Bluesky" },
  { key: "facebook" as const, Icon: FacebookIcon, label: "Partager sur Facebook" },
  { key: "whatsapp" as const, Icon: WhatsAppIcon, label: "Partager sur WhatsApp" },
] as const;

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
        {PLATFORMS.map(({ key, Icon, label }) => (
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
        {PLATFORMS.map(({ key, Icon, label }) => (
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
