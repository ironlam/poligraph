"use client";

import { useId, useMemo } from "react";
import { scaleLinear } from "d3-scale";

interface ParityBarData {
  label: string;
  femaleRate: number;
  totalCount: number;
}

interface ParityChartProps {
  data: ParityBarData[];
  title: string;
}

const BAR_HEIGHT = 32;
const LABEL_WIDTH = 180;
const PCT_WIDTH = 80;
const GAP = 4;

export function ParityChart({ data, title }: ParityChartProps) {
  const descId = useId();
  const sorted = useMemo(
    () => [...data].sort((a, b) => Math.abs(0.5 - a.femaleRate) - Math.abs(0.5 - b.femaleRate)),
    [data]
  );

  const xScale = useMemo(() => scaleLinear().domain([0, 1]).range([0, 100]), []);

  if (data.length === 0) return null;

  const svgHeight = sorted.length * (BAR_HEIGHT + GAP) + GAP;
  const svgWidth = LABEL_WIDTH + 300 + PCT_WIDTH;

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">{title}</h3>
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="w-full max-w-2xl"
          role="img"
          aria-label={`${title} : ${sorted.map((d) => `${d.label} ${Math.round(d.femaleRate * 100)}% F`).join(", ")}`}
          aria-describedby={descId}
        >
          {/* 50% reference line */}
          <line
            x1={LABEL_WIDTH + 150}
            y1={0}
            x2={LABEL_WIDTH + 150}
            y2={svgHeight}
            stroke="currentColor"
            strokeOpacity={0.2}
            strokeDasharray="4 2"
          />

          {sorted.map((item, i) => {
            const y = i * (BAR_HEIGHT + GAP) + GAP;
            const femaleWidth = xScale(item.femaleRate) * 3; // scale to 300px bar area
            const maleWidth = 300 - femaleWidth;
            const femalePct = Math.round(item.femaleRate * 100);
            const malePct = 100 - femalePct;

            return (
              <g key={item.label}>
                {/* Label */}
                <text
                  x={LABEL_WIDTH - 8}
                  y={y + BAR_HEIGHT / 2}
                  textAnchor="end"
                  dominantBaseline="central"
                  className="fill-current text-[11px]"
                >
                  {item.label.length > 22 ? item.label.slice(0, 20) + "..." : item.label}
                </text>

                {/* Female bar (pink) */}
                <rect
                  x={LABEL_WIDTH}
                  y={y}
                  width={Math.max(femaleWidth, 1)}
                  height={BAR_HEIGHT}
                  rx={4}
                  className="fill-pink-500"
                />

                {/* Male bar (blue) */}
                <rect
                  x={LABEL_WIDTH + femaleWidth}
                  y={y}
                  width={Math.max(maleWidth, 1)}
                  height={BAR_HEIGHT}
                  rx={4}
                  className="fill-blue-500"
                />

                {/* Percentages */}
                <text
                  x={LABEL_WIDTH + 300 + 8}
                  y={y + BAR_HEIGHT / 2}
                  dominantBaseline="central"
                  className="fill-current text-[10px] tabular-nums"
                >
                  {femalePct}% F / {malePct}% H
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Screen reader table */}
      <div className="sr-only">
        <table id={descId}>
          <caption>{title}</caption>
          <thead>
            <tr>
              <th>Catégorie</th>
              <th>Femmes (%)</th>
              <th>Hommes (%)</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((item) => (
              <tr key={item.label}>
                <td>{item.label}</td>
                <td>{Math.round(item.femaleRate * 100)}%</td>
                <td>{100 - Math.round(item.femaleRate * 100)}%</td>
                <td>{item.totalCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-pink-500" />
          <span>Femmes</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-blue-500" />
          <span>Hommes</span>
        </div>
        <div className="flex items-center gap-1.5 ml-auto">
          <div className="w-4 border-t border-dashed border-muted-foreground" />
          <span>Parité (50 %)</span>
        </div>
      </div>
    </div>
  );
}
