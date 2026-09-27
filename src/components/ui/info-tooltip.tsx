"use client";

import * as React from "react";
import { Info } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { GLOSSARY, type GlossaryKey } from "@/config/glossary";
import { cn } from "@/lib/utils";

interface InfoTooltipProps {
  /** Use a glossary key for centralized definitions */
  term?: GlossaryKey;
  /** Or provide custom text directly */
  text?: string;
  /** Optional link for "En savoir plus" */
  href?: string;
  /** Visual size — "sm" for inline, "md" for standalone */
  size?: "sm" | "md";
  /** Additional CSS classes on the trigger button */
  className?: string;
  /** Side of the tooltip */
  side?: "top" | "bottom" | "left" | "right";
  /** Readable name for screen readers; without it the glossary key is read out. */
  label?: string;
}

/**
 * Small info icon (?) that shows an explanatory tooltip on hover/focus,
 * and on tap for readers who have no pointer to hover with.
 * Accessible: focusable, announces content to screen readers.
 *
 * Usage:
 *   <InfoTooltip term="sursis" />           // from glossary
 *   <InfoTooltip text="Custom explanation" /> // inline text
 *   <InfoTooltip term="hatvp" href="https://www.hatvp.fr" /> // with link
 */
export function InfoTooltip({
  term,
  text,
  href,
  size = "sm",
  className,
  side = "top",
  label,
}: InfoTooltipProps) {
  /* A tap fires, in this order, `pointerdown`, `focus`, then `click`. Radix opens the
     tooltip on focus and closes it on click, so on mobile the definition appeared and
     vanished in the same gesture — the bug reported on the sénatoriales hub. Nothing in
     the sequence is avoidable, so the open state is driven here instead: the focus-opening
     is ignored on touch and the tap becomes a toggle. Hover and keyboard keep Radix's own
     behaviour, which already works. */
  const [open, setOpen] = React.useState(false);
  /** Whether the last pointer on the trigger was a finger or a stylus rather than a mouse. */
  const isTouchRef = React.useRef(false);
  /** Whether the tooltip was open when that pointer went down. */
  const wasOpenRef = React.useRef(false);

  const content = term ? GLOSSARY[term] : text;
  if (!content) return null;

  const iconSize = size === "sm" ? "w-3.5 h-3.5" : "w-4 h-4";

  const rememberPointerType = (event: React.PointerEvent<HTMLButtonElement>) => {
    isTouchRef.current = event.pointerType !== "mouse";
  };

  return (
    <Tooltip
      open={open}
      onOpenChange={(next) => {
        // Drop the opening that the tap's focus asks for; every closing is honoured,
        // including the one from tapping outside or pressing Échap.
        if (next && isTouchRef.current) return;
        setOpen(next);
      }}
    >
      <TooltipTrigger asChild>
        <button
          type="button"
          onPointerMove={rememberPointerType}
          onPointerDown={(event) => {
            rememberPointerType(event);
            /* Radix closes an open tooltip on `pointerdown`, and a tap outside the tooltip
               dismisses it too, so by the time the click lands the state no longer says
               whether the finger meant to open or to close. Read it here instead: these
               handlers run before Radix's own, which `Slot` composes after the child's. */
            wasOpenRef.current = open;
          }}
          onClick={(event) => {
            if (!isTouchRef.current) return;
            /* Stops Radix's click handler, which would close what the focus just opened:
               `composeEventHandlers` skips it once the event is default-prevented. The
               button submits nothing, so preventing the default costs nothing. */
            event.preventDefault();
            setOpen(!wasOpenRef.current);
          }}
          onBlur={() => {
            /* Leaving the trigger clears the touch flag: on a laptop with a touchscreen,
               a later hover or Tab must open the tooltip the ordinary way. */
            isTouchRef.current = false;
          }}
          className={cn(
            "inline-flex items-center justify-center rounded-full text-muted-foreground/60 hover:text-muted-foreground transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
            size === "sm" ? "p-0.5" : "p-1",
            className
          )}
          aria-label={`Aide : ${label ?? (term || "information")}`}
          title={`Aide : ${label ?? (term || "information")}`}
        >
          <Info className={iconSize} aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent side={side} className="max-w-[280px] text-[13px] leading-relaxed">
        <p>{content}</p>
        {href && (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="block mt-1.5 text-xs text-primary hover:underline"
          >
            En savoir plus →
          </a>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
