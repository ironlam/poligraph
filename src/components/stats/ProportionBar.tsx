"use client";

import { useId } from "react";
import { VERDICT_GROUP_COLORS } from "@/config/labels";

interface ProportionBarProps {
  breakdown: {
    vrai: number;
    trompeur: number;
    faux: number;
    inverifiable: number;
  };
  /** Show percentage labels inside segments */
  showLabels?: boolean;
}

export function ProportionBar({ breakdown, showLabels: _showLabels = false }: ProportionBarProps) {
  const descId = useId();
  const total = breakdown.vrai + breakdown.trompeur + breakdown.faux + breakdown.inverifiable;
  if (total === 0) return null;

  const segments = [
    {
      key: "vrai",
      value: breakdown.vrai,
      color: VERDICT_GROUP_COLORS.vrai,
      label: "Vrai",
    },
    {
      key: "trompeur",
      value: breakdown.trompeur,
      color: VERDICT_GROUP_COLORS.trompeur,
      label: "Trompeur",
    },
    {
      key: "faux",
      value: breakdown.faux,
      color: VERDICT_GROUP_COLORS.faux,
      label: "Faux",
    },
    {
      key: "inverifiable",
      value: breakdown.inverifiable,
      color: VERDICT_GROUP_COLORS.inverifiable,
      label: "Invérifiable",
    },
  ].filter((s) => s.value > 0);

  return (
    <>
      <div
        className="flex h-3 rounded-full overflow-hidden"
        role="img"
        aria-label={segments
          .map((s) => `${s.label}: ${((s.value / total) * 100).toFixed(0)}%`)
          .join(", ")}
        aria-describedby={descId}
      >
        {segments.map((segment) => {
          const pct = (segment.value / total) * 100;
          return (
            <div
              key={segment.key}
              className="h-full transition-all"
              style={{
                width: `${pct}%`,
                backgroundColor: segment.color,
                minWidth: pct > 0 ? "2px" : 0,
              }}
              title={`${segment.label}: ${pct.toFixed(0)}% (${segment.value})`}
            />
          );
        })}
      </div>
      <div className="sr-only">
        <table id={descId}>
          <caption>Répartition des verdicts</caption>
          <thead>
            <tr>
              <th>Verdict</th>
              <th>Nombre</th>
              <th>Pourcentage</th>
            </tr>
          </thead>
          <tbody>
            {segments.map((s) => (
              <tr key={s.key}>
                <td>{s.label}</td>
                <td>{s.value}</td>
                <td>{((s.value / total) * 100).toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
