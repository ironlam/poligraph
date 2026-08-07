"use client";

import { useEffect, useState } from "react";
import { useIsMounted } from "@/hooks/useIsMounted";

/**
 * Countdown for the homepage election banner.
 *
 * Separate from `ElectionCountdown` on purpose: that one renders four fixed columns inside a
 * gradient card and serves the election detail pages. Merging them would mean a component with
 * five layout props for two callers.
 *
 * The homepage is ISR-cached for 300 s. A day count rendered on the server stays right, hours and
 * minutes do not, so the values are computed after mount only. What differs from
 * `ElectionCountdown` is that this one renders a same-size skeleton instead of null: the banner is
 * the tallest card above the fold and collapsing it would shift the whole page at hydration.
 */

interface BannerCountdownProps {
  /** ISO string. Serialising here makes the server-to-client contract explicit. */
  targetDate: string;
  showSeconds: boolean;
  /** Accessible name of the timer, e.g. "Compte à rebours jusqu'au premier tour". */
  label: string;
}

type Remaining = { days: number; hours: number; minutes: number; seconds: number };

function computeRemaining(target: Date): Remaining {
  const diff = Math.max(0, target.getTime() - Date.now());
  return {
    days: Math.floor(diff / 86_400_000),
    hours: Math.floor(diff / 3_600_000) % 24,
    minutes: Math.floor(diff / 60_000) % 60,
    seconds: Math.floor(diff / 1_000) % 60,
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

export function BannerCountdown({ targetDate, showSeconds, label }: BannerCountdownProps) {
  const mounted = useIsMounted();
  const [remaining, setRemaining] = useState<Remaining>(() =>
    computeRemaining(new Date(targetDate))
  );

  useEffect(() => {
    const target = new Date(targetDate);
    const interval = setInterval(() => setRemaining(computeRemaining(target)), 1000);
    return () => clearInterval(interval);
  }, [targetDate]);

  const units: { value: string; label: string }[] = [
    { value: String(remaining.days), label: "jours" },
    { value: pad(remaining.hours), label: "heures" },
    { value: pad(remaining.minutes), label: "minutes" },
    ...(showSeconds ? [{ value: pad(remaining.seconds), label: "secondes" }] : []),
  ];

  return (
    <div role="timer" aria-label={label} className="flex gap-4 md:gap-6">
      {units.map((unit) => (
        <div key={unit.label} className="flex min-w-14 flex-col md:min-w-16">
          <span className="font-display text-3xl font-extrabold leading-none tracking-tight tabular-nums md:text-4xl">
            {/* Before mount the digits would diverge from the ISR-cached HTML, so the slot is
                reserved with a non-breaking space of the same line height instead. */}
            {mounted ? unit.value : " "}
          </span>
          <span className="mt-1 text-xs text-muted-foreground">{unit.label}</span>
        </div>
      ))}
    </div>
  );
}
