"use client";

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { MANDATE_TYPE_LABELS, AFFAIR_STATUS_LABELS } from "@/config/labels";
import { MANDATE_TYPE_COLORS, AFFAIR_STATUS_MARKER_COLORS } from "@/config/timeline";
import { formatDate } from "@/lib/utils";
import type { CareerTimelineProps, TimelineAffair, MobileEvent, TimelineMandate } from "./types";
import { mandateAffiliation } from "./utils";
import { TimelineLegend } from "./TimelineLegend";
import { ScreenReaderSummary } from "./ScreenReaderSummary";

export function MobileTimeline({
  mandates,
  partyHistory,
  timelineAffairs,
  deathDate,
}: {
  mandates: TimelineMandate[];
  partyHistory: CareerTimelineProps["partyHistory"];
  timelineAffairs: TimelineAffair[];
  deathDate?: Date | null;
}) {
  // Build a merged list of events sorted chronologically (oldest first)
  const events = useMemo((): MobileEvent[] => {
    const all: MobileEvent[] = [];

    mandates.forEach((m) => {
      all.push({ type: "mandate-start", date: new Date(m.startDate), mandate: m });
      if (m.endDate && !m.isCurrent) {
        all.push({ type: "mandate-end", date: new Date(m.endDate), mandate: m });
      }
    });

    partyHistory.forEach((ph) => {
      if (ph.startDate) {
        all.push({ type: "party-change", date: new Date(ph.startDate), party: ph });
      }
    });

    timelineAffairs.forEach((a) => {
      all.push({ type: "affair", date: a.date, affair: a });
    });

    if (deathDate) {
      all.push({ type: "death", date: new Date(deathDate) });
    }

    return all.sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [mandates, partyHistory, timelineAffairs, deathDate]);

  const { minYear, maxYear } = useMemo(() => {
    if (events.length === 0) return { minYear: 0, maxYear: 0 };
    return {
      minYear: events[0]!.date.getFullYear(),
      maxYear: events[events.length - 1]!.date.getFullYear(),
    };
  }, [events]);

  if (events.length === 0) {
    return <div className="text-center py-12 text-muted-foreground">Aucun mandat enregistré</div>;
  }

  return (
    <div className="space-y-4">
      <div className="relative ml-4 border-l-2 border-muted-foreground/20 pl-6 space-y-6">
        {events.map((event, i) => (
          <MobileEventCard key={`${event.type}-${i}`} event={event} />
        ))}
      </div>

      {/* ─── Legend ─── */}
      <TimelineLegend />

      {/* ─── Screen reader summary ─── */}
      <ScreenReaderSummary
        mandates={mandates}
        timelineAffairs={timelineAffairs}
        minYear={minYear}
        maxYear={maxYear}
      />
    </div>
  );
}

function MobileEventCard({ event }: { event: MobileEvent }) {
  switch (event.type) {
    case "mandate-start": {
      const color = MANDATE_TYPE_COLORS[event.mandate.type];
      const affiliation = mandateAffiliation(event.mandate);
      return (
        <div className="relative">
          <DotMarker color={color} />
          <div className="text-sm">
            <p className="font-medium">Début : {MANDATE_TYPE_LABELS[event.mandate.type]}</p>
            {affiliation && <p className="text-xs text-foreground/80">{affiliation}</p>}
            {event.mandate.constituency && (
              <p className="text-xs text-muted-foreground">{event.mandate.constituency}</p>
            )}
            <p className="text-xs text-muted-foreground mt-0.5">{formatDate(event.date)}</p>
            {event.mandate.isCurrent && (
              <Badge variant="outline" className="text-xs mt-1 border-green-500 text-green-600">
                En cours
              </Badge>
            )}
          </div>
        </div>
      );
    }
    case "mandate-end": {
      const affiliation = mandateAffiliation(event.mandate);
      return (
        <div className="relative">
          <DotMarker color="#9ca3af" />
          <div className="text-sm">
            <p className="font-medium text-muted-foreground">
              Fin : {MANDATE_TYPE_LABELS[event.mandate.type]}
            </p>
            {affiliation && <p className="text-xs text-muted-foreground">{affiliation}</p>}
            {event.mandate.constituency && (
              <p className="text-xs text-muted-foreground">{event.mandate.constituency}</p>
            )}
            <p className="text-xs text-muted-foreground mt-0.5">{formatDate(event.date)}</p>
          </div>
        </div>
      );
    }
    case "party-change": {
      const color = event.party.party.color || "#9ca3af";
      return (
        <div className="relative">
          <DotMarker color={color} />
          <div className="text-sm">
            <p className="font-medium">Rejoint {event.party.party.shortName}</p>
            <p className="text-xs text-muted-foreground">{event.party.party.name}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{formatDate(event.date)}</p>
          </div>
        </div>
      );
    }
    case "affair": {
      const color = AFFAIR_STATUS_MARKER_COLORS[event.affair.status];
      return (
        <div className="relative">
          <DiamondMarker color={color} />
          <div className="text-sm">
            <p className="font-medium">{event.affair.title}</p>
            <div className="mt-1">
              <Badge
                variant="outline"
                className="text-xs"
                style={{
                  borderColor: color,
                  color: color,
                }}
              >
                {AFFAIR_STATUS_LABELS[event.affair.status]}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {event.affair.category} - {formatDate(event.date)}
            </p>
          </div>
        </div>
      );
    }
    case "death": {
      return (
        <div className="relative">
          <DotMarker color="#6b7280" />
          <div className="text-sm">
            <p className="font-medium text-muted-foreground">Décès</p>
            <p className="text-xs text-muted-foreground mt-0.5">{formatDate(event.date)}</p>
          </div>
        </div>
      );
    }
  }
}

/** Circular dot positioned on the vertical line (mobile). */
function DotMarker({ color }: { color: string }) {
  return (
    <span
      className="absolute -left-[31px] top-1 w-3 h-3 rounded-full border-2 border-background"
      style={{ backgroundColor: color }}
    />
  );
}

/** Diamond marker positioned on the vertical line (mobile). */
function DiamondMarker({ color }: { color: string }) {
  return (
    <span
      className="absolute -left-[31px] top-1 w-3 h-3 border-2 border-background"
      style={{
        backgroundColor: color,
        clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)",
      }}
    />
  );
}
