"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { scaleTime } from "d3-scale";
import { Badge } from "@/components/ui/badge";
import { MANDATE_TYPE_LABELS, AFFAIR_STATUS_LABELS, AFFAIR_CATEGORY_LABELS } from "@/config/labels";
import { AFFAIR_STATUS_MARKER_COLORS, getMandateRow, MANDATE_ROW_LABELS } from "@/config/timeline";
import { formatDate } from "@/lib/utils";
import type { CareerTimelineProps, TooltipData, TimelineAffair } from "./types";
import { LEFT_MARGIN, RIGHT_MARGIN } from "./types";
import { computeDuration, computeOverlapOffsets, mandateAffiliation } from "./utils";
import { DesktopTimeline } from "./DesktopTimeline";
import { MobileTimeline } from "./MobileTimeline";

export function CareerTimeline({
  mandates,
  partyHistory,
  affairs,
  birthDate: _birthDate,
  deathDate,
}: CareerTimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(900);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const [isDesktop, setIsDesktop] = useState(true);

  // ─── Responsive detection ───────────────────────────────────────────
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1024px)");
    const handler = (e: MediaQueryListEvent | MediaQueryList) => setIsDesktop(e.matches);
    handler(mql);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  // ─── Container width tracking ───────────────────────────────────────
  useEffect(() => {
    const update = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.offsetWidth);
      }
    };
    update();
    const observer = new ResizeObserver(update);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // ─── Time range (career dates only) ─────────────────────────────────
  const { minDate, maxDate, xScale, renderWidth } = useMemo(() => {
    const now = new Date();
    const careerDates: Date[] = [];

    mandates.forEach((m) => {
      careerDates.push(new Date(m.startDate));
      if (m.endDate) careerDates.push(new Date(m.endDate));
    });
    partyHistory.forEach((ph) => {
      if (ph.startDate) careerDates.push(new Date(ph.startDate));
      if (ph.endDate) careerDates.push(new Date(ph.endDate));
    });
    affairs.forEach((a) => {
      if (a.verdictDate) careerDates.push(new Date(a.verdictDate));
      else if (a.startDate) careerDates.push(new Date(a.startDate));
      else if (a.factsDate) careerDates.push(new Date(a.factsDate));
    });

    if (careerDates.length === 0) {
      const fallbackMin = new Date(now.getFullYear() - 10, 0, 1);
      const fallbackMax = now;
      return {
        minDate: fallbackMin,
        maxDate: fallbackMax,
        renderWidth: containerWidth,
        xScale: scaleTime()
          .domain([fallbackMin, fallbackMax])
          .range([LEFT_MARGIN, containerWidth - RIGHT_MARGIN]),
      };
    }

    const timestamps = careerDates.map((d) => d.getTime());
    const rawMin = new Date(Math.min(...timestamps));
    const rawMax = deathDate
      ? new Date(Math.max(new Date(deathDate).getTime(), ...timestamps))
      : new Date(Math.max(now.getTime(), ...timestamps));

    // Pad 2 years on each side
    const minDate = new Date(rawMin.getFullYear() - 2, 0, 1);
    const maxDate = new Date(rawMax.getFullYear() + 2, 11, 31);

    // Ensure minimum width for very long careers (40px per year)
    const yearSpan = maxDate.getFullYear() - minDate.getFullYear();
    const neededWidth = yearSpan * 40 + LEFT_MARGIN + RIGHT_MARGIN;
    const renderWidth = Math.max(containerWidth, neededWidth);

    const scale = scaleTime()
      .domain([minDate, maxDate])
      .range([LEFT_MARGIN, renderWidth - RIGHT_MARGIN]);

    return { minDate, maxDate, xScale: scale, renderWidth };
  }, [mandates, partyHistory, affairs, deathDate, containerWidth]);

  // ─── Year markers ───────────────────────────────────────────────────
  const yearMarkers = useMemo(() => {
    const markers: number[] = [];
    const startYear = minDate.getFullYear();
    // Round up to nearest 5
    const first = Math.ceil(startYear / 5) * 5;
    for (let y = first; y <= maxDate.getFullYear(); y += 5) {
      markers.push(y);
    }
    return markers;
  }, [minDate, maxDate]);

  // ─── Mandate rows (grouped by category) ────────────────────────────
  const mandateRows = useMemo(() => {
    const rowMap = new Map<number, typeof mandates>();
    mandates.forEach((m) => {
      const row = getMandateRow(m.type);
      if (!rowMap.has(row)) rowMap.set(row, []);
      rowMap.get(row)!.push(m);
    });

    const ordered: {
      row: number;
      label: string;
      mandates: typeof mandates;
      overlapOffsets: Map<string, number>;
      maxLanes: number;
    }[] = [];

    for (let i = 0; i < MANDATE_ROW_LABELS.length; i++) {
      if (rowMap.has(i)) {
        const rowMandates = rowMap.get(i)!;
        const offsets = computeOverlapOffsets(rowMandates);
        const maxLanes = Math.max(0, ...offsets.values()) + 1;
        ordered.push({
          row: i,
          label: MANDATE_ROW_LABELS[i]!,
          mandates: rowMandates,
          overlapOffsets: offsets,
          maxLanes,
        });
      }
    }
    return ordered;
  }, [mandates]);

  // ─── Timeline affairs ───────────────────────────────────────────────
  const timelineAffairs = useMemo((): TimelineAffair[] => {
    return affairs
      .filter((a) => a.verdictDate || a.startDate || a.factsDate)
      .map((a) => ({
        id: a.id,
        title: a.title,
        date: new Date(a.verdictDate || a.startDate || a.factsDate!),
        status: a.status,
        category: AFFAIR_CATEGORY_LABELS[a.category],
      }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [affairs]);

  // ─── Tooltip handlers ──────────────────────────────────────────────
  const showTooltip = useCallback((event: React.MouseEvent, content: React.ReactNode) => {
    const containerRect = containerRef.current?.getBoundingClientRect();
    if (!containerRect) return;
    const rect = event.currentTarget.getBoundingClientRect();
    setTooltip({
      x: rect.left - containerRect.left + rect.width / 2,
      y: rect.top - containerRect.top,
      content,
    });
  }, []);

  const handleMandateHover = useCallback(
    (mandate: (typeof mandates)[number], event: React.MouseEvent) => {
      const affiliation = mandateAffiliation(mandate);
      showTooltip(
        event,
        <div className="text-left">
          <p className="font-semibold">{MANDATE_TYPE_LABELS[mandate.type]}</p>
          {affiliation && <p className="text-xs">{affiliation}</p>}
          {mandate.constituency && (
            <p className="text-xs text-muted-foreground">{mandate.constituency}</p>
          )}
          <p className="text-xs mt-1">
            {formatDate(mandate.startDate)} -{" "}
            {mandate.isCurrent ? "Aujourd'hui" : formatDate(mandate.endDate)}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {computeDuration(mandate.startDate, mandate.endDate)}
          </p>
        </div>
      );
    },
    [showTooltip]
  );

  const handleAffairHover = useCallback(
    (affair: TimelineAffair, event: React.MouseEvent) => {
      showTooltip(
        event,
        <div className="text-left max-w-xs">
          <p className="font-semibold">{affair.title}</p>
          <div className="mt-1">
            <Badge
              variant="outline"
              className="text-xs"
              style={{
                borderColor: AFFAIR_STATUS_MARKER_COLORS[affair.status],
                color: AFFAIR_STATUS_MARKER_COLORS[affair.status],
              }}
            >
              {AFFAIR_STATUS_LABELS[affair.status]}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {affair.category} - {formatDate(affair.date)}
          </p>
        </div>
      );
    },
    [showTooltip]
  );

  const hideTooltip = useCallback(() => setTooltip(null), []);

  // ─── Empty state ────────────────────────────────────────────────────
  if (mandates.length === 0 && affairs.length === 0 && partyHistory.length === 0) {
    return <div className="text-center py-12 text-muted-foreground">Aucun mandat enregistré</div>;
  }

  // ─── Desktop: Horizontal Timeline ──────────────────────────────────
  if (isDesktop) {
    return (
      <DesktopTimeline
        containerRef={containerRef}
        renderWidth={renderWidth}
        tooltip={tooltip}
        xScale={xScale}
        yearMarkers={yearMarkers}
        mandates={mandates}
        mandateRows={mandateRows}
        timelineAffairs={timelineAffairs}
        partyHistory={partyHistory}
        deathDate={deathDate}
        minDate={minDate}
        maxDate={maxDate}
        onMandateHover={handleMandateHover}
        onAffairHover={handleAffairHover}
        onHideTooltip={hideTooltip}
      />
    );
  }

  // ─── Mobile: Vertical Timeline ─────────────────────────────────────
  return (
    <MobileTimeline
      mandates={mandates}
      partyHistory={partyHistory}
      timelineAffairs={timelineAffairs}
      deathDate={deathDate}
    />
  );
}
