"use client";

import { useState } from "react";
import { Link2, Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { buildAnchorUrl } from "@/lib/cite";

type CiteAnchorProps = { label: string; className?: string } & (
  | { anchorId: string; permalink?: never }
  | { permalink: string; anchorId?: never }
);

export function CiteAnchor(props: CiteAnchorProps) {
  const { label, className } = props;
  const [copied, setCopied] = useState(false);
  const href = typeof props.anchorId === "string" ? `#${props.anchorId}` : props.permalink;

  async function handleClick(e: React.MouseEvent<HTMLAnchorElement>) {
    e.preventDefault();
    const url =
      typeof props.anchorId === "string" ? buildAnchorUrl(props.anchorId) : props.permalink;
    try {
      await navigator.clipboard.writeText(url);
      if (typeof props.anchorId === "string") {
        window.history.replaceState(null, "", `#${props.anchorId}`);
      }
      setCopied(true);
      toast.success("Lien copié");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Impossible de copier le lien");
    }
  }

  return (
    <a
      href={href}
      onClick={handleClick}
      aria-label={`Copier le lien vers ${label}`}
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground",
        "opacity-0 transition-opacity hover:bg-muted hover:text-foreground",
        "group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "[@media(hover:none)]:opacity-100",
        className
      )}
    >
      {copied ? <Check className="size-4" aria-hidden /> : <Link2 className="size-4" aria-hidden />}
    </a>
  );
}
