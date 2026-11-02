"use client";

import { useEffect, useState } from "react";
import { daysUntil } from "@/lib/elections/countdown";

/**
 * J-N pill. The hub is ISR-cached for 24 h, so the server count can trail by a day: it renders
 * first (readable without JS, same HTML as the cache), then the browser recounts once.
 */
export function DaysUntilBadge({
  targetDate,
  serverDays,
  className,
}: {
  /** ISO string, so the server-to-client contract is explicit. */
  targetDate: string;
  serverDays: number;
  className?: string;
}) {
  const [days, setDays] = useState(serverDays);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one recount after hydration
    setDays(daysUntil(new Date(targetDate), new Date()));
  }, [targetDate]);

  if (days <= 0) return null;
  return <span className={className}>J-{days}</span>;
}
