"use client";

import { useId } from "react";
import { arc, pie } from "d3-shape";

interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

interface DonutChartProps {
  segments: DonutSegment[];
  size?: number;
  title: string;
}

export function DonutChart({ segments, size = 200, title }: DonutChartProps) {
  const descId = useId();
  const total = segments.reduce((s, d) => s + d.value, 0);
  if (total === 0) return null;

  const radius = size / 2;
  const innerRadius = radius * 0.55;
  const outerRadius = radius * 0.95;

  const pieGenerator = pie<DonutSegment>()
    .value((d) => d.value)
    .sort(null);
  const arcGenerator = arc<(typeof arcs)[number]>()
    .innerRadius(innerRadius)
    .outerRadius(outerRadius);

  const arcs = pieGenerator(segments);

  return (
    <div>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`${title} : ${segments.map((s) => `${s.label} ${s.value}`).join(", ")}`}
        aria-describedby={descId}
        className="mx-auto"
      >
        <g transform={`translate(${radius}, ${radius})`}>
          {arcs.map((a, i) => (
            <path key={i} d={arcGenerator(a)!} fill={a.data.color} stroke="white" strokeWidth={2} />
          ))}
          <text textAnchor="middle" dy="-0.3em" className="fill-foreground text-2xl font-bold">
            {total}
          </text>
          <text textAnchor="middle" dy="1.2em" className="fill-muted-foreground text-xs">
            total
          </text>
        </g>
      </svg>
      {/* Screen reader table */}
      <div className="sr-only">
        <table id={descId}>
          <caption>{title}</caption>
          <thead>
            <tr>
              <th>Catégorie</th>
              <th>Nombre</th>
              <th>Pourcentage</th>
            </tr>
          </thead>
          <tbody>
            {segments.map((s) => (
              <tr key={s.label}>
                <td>{s.label}</td>
                <td>{s.value}</td>
                <td>{total > 0 ? ((s.value / total) * 100).toFixed(1) : 0}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Visual legend */}
      <div className="flex flex-wrap justify-center gap-3 mt-4">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-1.5 text-sm">
            <span
              className="inline-block w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: s.color }}
            />
            <span>
              {s.label} <span className="text-muted-foreground">({s.value})</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
