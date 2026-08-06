"use client";

import type { scaleTime } from "d3-scale";
import { MANDATE_TYPE_LABELS, AFFAIR_STATUS_LABELS } from "@/config/labels";
import { MANDATE_TYPE_COLORS, AFFAIR_STATUS_MARKER_COLORS } from "@/config/timeline";
import { formatDate } from "@/lib/utils";
import type { CareerTimelineProps, TooltipData, TimelineAffair, TimelineMandate } from "./types";
import { mandateAffiliation } from "./utils";
import {
  LEFT_MARGIN,
  RIGHT_MARGIN,
  ROW_HEIGHT,
  BAR_HEIGHT,
  MIN_BAR_WIDTH,
  MARKER_SIZE,
  PARTY_BAND_HEIGHT,
  YEAR_AXIS_HEIGHT,
} from "./types";
import { TimelineLegend } from "./TimelineLegend";
import { ScreenReaderSummary } from "./ScreenReaderSummary";

export function DesktopTimeline({
  containerRef,
  renderWidth,
  tooltip,
  xScale,
  yearMarkers,
  mandates,
  mandateRows,
  timelineAffairs,
  partyHistory,
  deathDate,
  minDate,
  maxDate,
  onMandateHover,
  onAffairHover,
  onHideTooltip,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
  renderWidth: number;
  tooltip: TooltipData | null;
  xScale: ReturnType<typeof scaleTime<number, number>>;
  yearMarkers: number[];
  mandates: TimelineMandate[];
  mandateRows: {
    row: number;
    label: string;
    mandates: TimelineMandate[];
    overlapOffsets: Map<string, number>;
    maxLanes: number;
  }[];
  timelineAffairs: TimelineAffair[];
  partyHistory: CareerTimelineProps["partyHistory"];
  deathDate?: Date | null;
  minDate: Date;
  maxDate: Date;
  onMandateHover: (mandate: TimelineMandate, e: React.MouseEvent) => void;
  onAffairHover: (affair: TimelineAffair, e: React.MouseEvent) => void;
  onHideTooltip: () => void;
}) {
  // Calculate total height
  const hasPartyBand = partyHistory.length > 0;
  const hasAffairs = timelineAffairs.length > 0;

  // Compute cumulative y offsets for each row
  let currentY = YEAR_AXIS_HEIGHT;
  if (hasPartyBand) currentY += PARTY_BAND_HEIGHT + 4;

  const rowYPositions: number[] = [];
  for (const { maxLanes } of mandateRows) {
    rowYPositions.push(currentY);
    currentY += maxLanes * ROW_HEIGHT;
  }

  const affairsY = currentY + 8;
  if (hasAffairs) currentY += ROW_HEIGHT + 8;

  const totalHeight = currentY + 8;

  return (
    <div className="space-y-4">
      <div
        ref={containerRef}
        className="relative overflow-x-auto"
        role="img"
        aria-label={`Chronologie politique de ${minDate.getFullYear()} à ${maxDate.getFullYear()} avec ${mandateRows.reduce((sum, r) => sum + r.mandates.length, 0)} mandats${timelineAffairs.length > 0 ? ` et ${timelineAffairs.length} affaires` : ""}`}
      >
        {/* Tooltip */}
        {tooltip && (
          <div
            className="absolute z-50 px-3 py-2 bg-popover text-popover-foreground border rounded-md shadow-lg text-sm pointer-events-none max-w-xs"
            style={{
              left: tooltip.x,
              top: tooltip.y - 8,
              transform: "translate(-50%, -100%)",
            }}
          >
            {tooltip.content}
          </div>
        )}

        <div className="relative" style={{ width: renderWidth, height: totalHeight }}>
          {/* ─── Year axis + vertical guides ─── */}
          {yearMarkers.map((year) => {
            const x = xScale(new Date(year, 0, 1));
            return (
              <div key={year}>
                {/* Year label */}
                <div
                  className="absolute text-xs text-muted-foreground select-none"
                  style={{
                    left: x,
                    top: 0,
                    transform: "translateX(-50%)",
                  }}
                >
                  {year}
                </div>
                {/* Vertical guide line */}
                <div
                  className="absolute border-l border-dashed border-muted-foreground/20"
                  style={{
                    left: x,
                    top: YEAR_AXIS_HEIGHT - 4,
                    height: totalHeight - YEAR_AXIS_HEIGHT,
                  }}
                />
              </div>
            );
          })}

          {/* ─── Death marker ─── */}
          {deathDate && (
            <div
              className="absolute flex flex-col items-center"
              style={{
                left: xScale(new Date(deathDate)),
                top: YEAR_AXIS_HEIGHT - 8,
                transform: "translateX(-50%)",
              }}
            >
              <div className="w-2 h-2 rounded-full bg-muted-foreground" />
              <span className="text-[9px] text-muted-foreground mt-0.5">Décès</span>
            </div>
          )}

          {/* ─── Party band ─── */}
          {hasPartyBand &&
            partyHistory
              .filter((ph) => ph.startDate)
              .map((ph) => {
                const start = xScale(new Date(ph.startDate!));
                const end = xScale(ph.endDate ? new Date(ph.endDate) : new Date());
                const width = Math.max(end - start, MIN_BAR_WIDTH);
                const color = ph.party.color || "#9ca3af";
                return (
                  <div
                    key={ph.id}
                    className="absolute rounded-sm"
                    title={ph.party.shortName}
                    style={{
                      left: start,
                      top: YEAR_AXIS_HEIGHT,
                      width,
                      height: PARTY_BAND_HEIGHT,
                      backgroundColor: color,
                      opacity: 0.12,
                    }}
                  />
                );
              })}

          {/* ─── Row labels ─── */}
          {mandateRows.map(({ label }, index) => (
            <div
              key={label}
              className="absolute text-xs text-muted-foreground font-medium select-none flex items-center"
              style={{
                left: 0,
                top: rowYPositions[index],
                height: ROW_HEIGHT,
                width: LEFT_MARGIN - 8,
              }}
            >
              {label}
            </div>
          ))}

          {/* ─── Mandate bars ─── */}
          {mandateRows.map(({ mandates: rowMandates, overlapOffsets }, rowIndex) =>
            rowMandates.map((mandate) => {
              const startX = xScale(new Date(mandate.startDate));
              const endDate = mandate.endDate
                ? new Date(mandate.endDate)
                : deathDate
                  ? new Date(deathDate)
                  : new Date();
              const endX = xScale(endDate);
              const width = Math.max(endX - startX, MIN_BAR_WIDTH);
              const color = MANDATE_TYPE_COLORS[mandate.type];
              const affiliation = mandateAffiliation(mandate);
              const laneOffset = overlapOffsets.get(mandate.id) ?? 0;
              const top =
                rowYPositions[rowIndex]! + laneOffset * ROW_HEIGHT + (ROW_HEIGHT - BAR_HEIGHT) / 2;

              return (
                <div
                  key={mandate.id}
                  className="absolute rounded cursor-pointer transition-opacity hover:opacity-100"
                  style={{
                    left: startX,
                    top,
                    width,
                    height: BAR_HEIGHT,
                    backgroundColor: color,
                    opacity: 0.85,
                    borderRadius: 4,
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label={`${MANDATE_TYPE_LABELS[mandate.type]}${affiliation ? `, ${affiliation}` : ""}${mandate.constituency ? `, ${mandate.constituency}` : ""}, ${new Date(mandate.startDate).getFullYear()} - ${mandate.isCurrent ? "présent" : mandate.endDate ? new Date(mandate.endDate).getFullYear() : ""}`}
                  onMouseEnter={(e) => onMandateHover(mandate, e)}
                  onMouseLeave={onHideTooltip}
                >
                  {/* Current mandate pulsing dot */}
                  {mandate.isCurrent && (
                    <span
                      className="absolute w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse"
                      style={{
                        right: 4,
                        top: "50%",
                        transform: "translateY(-50%)",
                      }}
                    />
                  )}
                </div>
              );
            })
          )}

          {/* ─── Affairs row ─── */}
          {hasAffairs && (
            <>
              {/* Separator line */}
              <div
                className="absolute border-t border-muted-foreground/15"
                style={{
                  left: LEFT_MARGIN,
                  top: affairsY - 4,
                  width: renderWidth - LEFT_MARGIN - RIGHT_MARGIN,
                }}
              />
              {/* Label */}
              <div
                className="absolute text-xs text-muted-foreground font-medium select-none flex items-center"
                style={{
                  left: 0,
                  top: affairsY,
                  height: ROW_HEIGHT,
                  width: LEFT_MARGIN - 8,
                }}
              >
                Affaires
              </div>
              {/* Affair markers */}
              {timelineAffairs.map((affair, index) => {
                const x = xScale(affair.date);
                const color = AFFAIR_STATUS_MARKER_COLORS[affair.status];

                // Offset overlapping markers
                const prevOverlaps = timelineAffairs
                  .slice(0, index)
                  .filter((a) => Math.abs(xScale(a.date) - x) < MARKER_SIZE).length;
                const offsetY = prevOverlaps * (MARKER_SIZE + 2);

                return (
                  <div
                    key={affair.id}
                    className="absolute cursor-pointer transition-transform hover:scale-125"
                    style={{
                      left: x - MARKER_SIZE / 2,
                      top: affairsY + (ROW_HEIGHT - MARKER_SIZE) / 2 + offsetY,
                      width: MARKER_SIZE,
                      height: MARKER_SIZE,
                      backgroundColor: color,
                      clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)",
                    }}
                    role="button"
                    tabIndex={0}
                    aria-label={`Affaire: ${affair.title}, ${AFFAIR_STATUS_LABELS[affair.status]}, ${formatDate(affair.date)}`}
                    onMouseEnter={(e) => onAffairHover(affair, e)}
                    onMouseLeave={onHideTooltip}
                  />
                );
              })}
            </>
          )}
        </div>
      </div>

      {/* ─── Legend ─── */}
      <TimelineLegend />

      {/* ─── Screen reader summary ─── */}
      <ScreenReaderSummary
        mandates={mandates}
        timelineAffairs={timelineAffairs}
        minYear={minDate.getFullYear()}
        maxYear={maxDate.getFullYear()}
      />
    </div>
  );
}
