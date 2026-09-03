"use client";

import { useMemo, useState, useCallback, useId } from "react";
import { computeHemicycleLayout } from "./hemicycle-layout";
import { CERTAINTY_LABELS } from "@/config/certainty";
import type { HemicycleGroup, HemicycleDeputy } from "@/lib/data/hemicycle";

interface HemicycleProps {
  groups: HemicycleGroup[];
}

interface TooltipData {
  deputy: HemicycleDeputy;
  groupName: string;
  groupCode: string;
  x: number;
  y: number;
}

const SVG_WIDTH = 800;
const SVG_HEIGHT = 420;
const BASE_RADIUS = 3.8;
const MAX_SCALE = 3;
const RADIUS_STOPS = [
  [0, BASE_RADIUS],
  [1, BASE_RADIUS * 1.4],
  [4, BASE_RADIUS * 2],
  [12, BASE_RADIUS * MAX_SCALE],
] as const;

function radiusForScore(score: number): number {
  const value = Math.max(0, Math.min(score, 12));

  for (let index = 1; index < RADIUS_STOPS.length; index++) {
    const [nextScore, nextRadius] = RADIUS_STOPS[index]!;
    if (value > nextScore) continue;
    const [previousScore, previousRadius] = RADIUS_STOPS[index - 1]!;
    const ratio = (value - previousScore) / (nextScore - previousScore);
    return previousRadius + ratio * (nextRadius - previousRadius);
  }

  return BASE_RADIUS * MAX_SCALE;
}

export function Hemicycle({ groups }: HemicycleProps) {
  const descId = useId();
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const [highlightGroup, setHighlightGroup] = useState<string | null>(null);

  const { seats, deputyMap } = useMemo(() => {
    const activeGroups = groups.filter((g) => g.deputies.length > 0);
    const groupInputs = activeGroups.map((g) => ({
      code: g.code,
      color: g.color,
      seats: g.deputies.length,
    }));

    const seatPositions = computeHemicycleLayout(groupInputs, {
      width: SVG_WIDTH,
      height: SVG_HEIGHT - 20,
    });

    // Sort: highest severity score first, then alphabetical
    const groupDeputyLists = new Map<
      string,
      {
        items: { deputy: HemicycleDeputy; groupName: string; groupCode: string }[];
        cursor: number;
      }
    >();
    for (const group of activeGroups) {
      const sorted = [...group.deputies].sort((a, b) => {
        if (b.severityScore !== a.severityScore) return b.severityScore - a.severityScore;
        return a.lastName.localeCompare(b.lastName, "fr");
      });
      groupDeputyLists.set(group.code, {
        items: sorted.map((deputy) => ({
          deputy,
          groupName: group.shortName || group.name,
          groupCode: group.code,
        })),
        cursor: 0,
      });
    }

    const dMap = new Map<
      number,
      { deputy: HemicycleDeputy; groupName: string; groupCode: string }
    >();
    for (const seat of seatPositions) {
      const groupData = groupDeputyLists.get(seat.groupCode);
      if (groupData && groupData.cursor < groupData.items.length) {
        dMap.set(seat.seatIndex, groupData.items[groupData.cursor]!);
        groupData.cursor++;
      }
    }

    return { seats: seatPositions, deputyMap: dMap };
  }, [groups]);

  // Counts follow the legend: selecting a group without moving the numbers made
  // the chart say "I am looking at one group" while the sentence below still
  // described the whole chamber.
  const summary = useMemo(() => {
    const scoped = [...deputyMap.values()].filter(
      (d) => !highlightGroup || d.groupCode === highlightGroup
    );
    const seatCount = highlightGroup
      ? seats.filter((s) => s.groupCode === highlightGroup).length
      : seats.length;
    const selected = highlightGroup ? groups.find((g) => g.code === highlightGroup) : undefined;

    return {
      misEnCause: scoped.filter((d) => d.deputy.activeAffairCount > 0).length,
      condamnes: scoped.filter(
        (d) => d.deputy.maxCertaintyLevel === "ETABLI" || d.deputy.maxCertaintyLevel === "PRONONCE"
      ).length,
      seatCount,
      groupLabel: selected ? selected.shortName || selected.code : null,
    };
  }, [deputyMap, seats, highlightGroup, groups]);

  const handleMouseEnter = useCallback(
    (seatIdx: number, event: React.MouseEvent<SVGCircleElement>) => {
      const data = deputyMap.get(seatIdx);
      if (!data) return;
      const svg = event.currentTarget.closest("svg");
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      setTooltip({
        deputy: data.deputy,
        groupName: data.groupName,
        groupCode: data.groupCode,
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      });
    },
    [deputyMap]
  );

  const handleMouseLeave = useCallback(() => setTooltip(null), []);

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        className="w-full h-auto"
        role="img"
        aria-label={`Hémicycle de l'Assemblée nationale : ${summary.misEnCause} député${summary.misEnCause !== 1 ? "s" : ""}${summary.groupLabel ? ` du groupe ${summary.groupLabel}` : ""} mis en cause dans une affaire judiciaire sur ${summary.seatCount}`}
        aria-describedby={descId}
      >
        {seats.map((seat, i) => {
          const data = deputyMap.get(seat.seatIndex);
          const deputy = data?.deputy;
          const score = deputy?.severityScore ?? 0;
          const r = radiusForScore(score);
          const isHighlighted = !highlightGroup || seat.groupCode === highlightGroup;
          const hasIssue = score > 0;
          const maxLevel = deputy?.maxCertaintyLevel;

          // ETABLI = thick red stroke, PRONONCE = medium orange stroke, EN_COURS = thin gray stroke
          const fill = seat.groupColor;
          const stroke =
            maxLevel === "ETABLI"
              ? "#991b1b"
              : maxLevel === "PRONONCE"
                ? "#c2410c"
                : hasIssue
                  ? "rgba(0,0,0,0.3)"
                  : "none";
          const strokeWidth =
            maxLevel === "ETABLI" ? 2 : maxLevel === "PRONONCE" ? 1.5 : hasIssue ? 0.8 : 0;

          const circle = (
            <circle
              cx={seat.x}
              cy={seat.y}
              r={r}
              fill={fill}
              opacity={isHighlighted ? (hasIssue ? 1 : 0.35) : 0.08}
              stroke={stroke}
              strokeWidth={strokeWidth}
              className="cursor-pointer transition-opacity duration-200"
              onMouseEnter={(e) => handleMouseEnter(seat.seatIndex, e)}
              onMouseLeave={handleMouseLeave}
            />
          );

          if (!data) return <g key={i}>{circle}</g>;

          const deputyName = `${data.deputy.firstName} ${data.deputy.lastName}`;
          return (
            <a
              key={i}
              href={`/politiques/${data.deputy.slug}`}
              aria-label={`Voir la fiche de ${deputyName}`}
              className="group focus:outline-none"
              onFocus={() =>
                setTooltip({
                  deputy: data.deputy,
                  groupName: data.groupName,
                  groupCode: data.groupCode,
                  x: seat.x,
                  y: seat.y,
                })
              }
              onBlur={handleMouseLeave}
            >
              <title>{`${deputyName}, ${data.groupName}`}</title>
              {circle}
            </a>
          );
        })}
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border bg-popover px-3 py-2 text-sm shadow-md max-w-[220px]"
          style={{
            left: `clamp(100px, ${tooltip.x}px, calc(100% - 100px))`,
            top: Math.max(0, tooltip.y - 10),
            transform: "translate(-50%, -100%)",
          }}
        >
          <div className="font-semibold">
            {tooltip.deputy.firstName} {tooltip.deputy.lastName}
          </div>
          <div className="text-muted-foreground">
            {tooltip.groupName} ({tooltip.groupCode})
          </div>
          {tooltip.deputy.maxCertaintyLevel && (
            <div
              className={
                tooltip.deputy.maxCertaintyLevel === "ETABLI"
                  ? "font-medium text-red-600 dark:text-red-400"
                  : tooltip.deputy.maxCertaintyLevel === "PRONONCE"
                    ? "font-medium text-orange-600 dark:text-orange-400"
                    : "font-medium text-amber-600 dark:text-amber-400"
              }
            >
              {CERTAINTY_LABELS[tooltip.deputy.maxCertaintyLevel]}
            </div>
          )}
          {tooltip.deputy.activeAffairCount > 1 && (
            <div className="text-xs text-muted-foreground">
              {tooltip.deputy.activeAffairCount} affaires actives
            </div>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 mt-3 text-xs">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <span className="font-medium text-foreground">Taille =</span>
          <span>certitude judiciaire</span>
        </div>
        <div className="flex items-center gap-1.5">
          <svg width="14" height="14">
            <circle cx="7" cy="7" r="5" fill="#9ca3af" stroke="#991b1b" strokeWidth="2" />
          </svg>
          <span className="font-medium">Condamnation définitive</span>
        </div>
        <div className="flex items-center gap-1.5">
          <svg width="14" height="14">
            <circle cx="7" cy="7" r="5" fill="#9ca3af" stroke="#c2410c" strokeWidth="1.5" />
          </svg>
          <span className="text-muted-foreground font-medium">Condamnation non définitive</span>
        </div>
        <div className="flex items-center gap-1.5">
          <svg width="14" height="14">
            <circle cx="7" cy="7" r="5" fill="#9ca3af" stroke="rgba(0,0,0,0.4)" strokeWidth="1.5" />
          </svg>
          <span className="text-muted-foreground font-medium">Procédure en cours</span>
        </div>
      </div>

      {/* Group legend */}
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 mt-2">
        {groups.map((g) => (
          <button
            key={g.code}
            className="flex items-center gap-1.5 text-xs hover:underline focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 rounded-sm"
            style={{ opacity: !highlightGroup || highlightGroup === g.code ? 1 : 0.4 }}
            aria-pressed={highlightGroup === g.code}
            onClick={() => setHighlightGroup((prev) => (prev === g.code ? null : g.code))}
          >
            <span
              className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: g.color }}
            />
            <span>{g.shortName || g.code}</span>
            <span className="text-muted-foreground">({g.deputies.length})</span>
          </button>
        ))}
      </div>

      {/* Summary stat */}
      <p
        className="text-center text-sm text-muted-foreground mt-2"
        data-testid="hemicycle-summary"
        aria-live="polite"
      >
        <span className="font-semibold text-amber-600 dark:text-amber-400">
          {summary.misEnCause}
        </span>{" "}
        député{summary.misEnCause !== 1 ? "s" : ""}
        {summary.groupLabel && ` du groupe ${summary.groupLabel}`} mis en cause dans au moins une
        affaire judiciaire sur <span className="font-semibold">{summary.seatCount}</span>
        {summary.condamnes > 0 && (
          <>
            {" "}
            dont <span className="font-semibold">{summary.condamnes}</span> condamné
            {summary.condamnes !== 1 ? "s" : ""}
          </>
        )}
      </p>

      {highlightGroup && (
        <div className="mt-2 text-center">
          <button
            className="text-xs text-primary hover:underline focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 rounded-sm"
            onClick={() => setHighlightGroup(null)}
          >
            Voir tous les groupes
          </button>
        </div>
      )}

      {/* SR-only accessible table */}
      <div className="sr-only">
        <table id={descId}>
          <caption>Affaires judiciaires par groupe parlementaire</caption>
          <thead>
            <tr>
              <th>Groupe</th>
              <th>Députés</th>
              <th>Mis en cause</th>
              <th>Condamnés</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.code}>
                <td>{g.shortName || g.name}</td>
                <td>{g.deputies.length}</td>
                <td>{g.deputies.filter((d) => d.activeAffairCount > 0).length}</td>
                <td>
                  {
                    g.deputies.filter(
                      (d) => d.maxCertaintyLevel === "ETABLI" || d.maxCertaintyLevel === "PRONONCE"
                    ).length
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
