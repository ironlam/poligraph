"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { computeHemicycleLayout } from "@/components/stats/hemicycle-layout";
import type { GroupListingItem } from "@/lib/data/groupes";
import { ROUTES } from "@/config/routes";
import { ArrowRight } from "lucide-react";

/**
 * Explicit political seating order per chamber (left → right as viewed from the president's chair).
 * This matches the real physical arrangement in each chamber.
 */
const AN_SEATING_ORDER = [
  "GDR",
  "LFI-NFP",
  "ECOS",
  "SOC",
  "LIOT",
  "DEM",
  "EPR",
  "HOR",
  "DR",
  "UDR",
  "RN",
  "NI",
];
const SENAT_SEATING_ORDER = [
  "CRCE-K",
  "GEST",
  "SER",
  "RDSE",
  "RDPI",
  "UC",
  "LIRT",
  "LR",
  "RN",
  "NI",
];

interface Props {
  anGroups: GroupListingItem[];
  senatGroups: GroupListingItem[];
}

export function CompositionHemicycle({ anGroups, senatGroups }: Props) {
  const router = useRouter();
  const [chamber, setChamber] = useState<"AN" | "SENAT">("AN");
  const [hoveredGroup, setHoveredGroup] = useState<string | null>(null);

  const activeGroups = chamber === "AN" ? anGroups : senatGroups;
  const seatingOrder = chamber === "AN" ? AN_SEATING_ORDER : SENAT_SEATING_ORDER;

  const sortedGroups = useMemo(() => {
    return [...activeGroups]
      .filter((g) => g.seatCount > 0)
      .sort((a, b) => {
        const ia = seatingOrder.indexOf(a.code);
        const ib = seatingOrder.indexOf(b.code);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      });
  }, [activeGroups, seatingOrder]);

  const seats = useMemo(() => {
    return computeHemicycleLayout(
      sortedGroups.map((g) => ({
        code: g.code,
        color: g.color ?? "#999",
        seats: g.seatCount,
      })),
      { rows: chamber === "AN" ? 12 : 10 }
    );
  }, [sortedGroups, chamber]);

  const totalSeats = sortedGroups.reduce((s, g) => s + g.seatCount, 0);
  const hoveredData = hoveredGroup ? sortedGroups.find((g) => g.code === hoveredGroup) : null;

  const slugMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of sortedGroups) {
      if (g.slug) map.set(g.code, g.slug);
    }
    return map;
  }, [sortedGroups]);

  const handleSvgMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const group = (e.target as SVGElement).dataset.group;
    setHoveredGroup(group ?? null);
  };

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const group = (e.target as SVGElement).dataset.group;
    if (group) {
      const slug = slugMap.get(group);
      if (slug) router.push(ROUTES.groupeDetail(slug));
    }
  };

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Groupes parlementaires</h2>
        <Link
          href={ROUTES.groupes}
          className="text-sm text-primary hover:underline flex items-center gap-1"
        >
          Tous les groupes <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 mb-4 bg-muted/50 rounded-lg p-1 w-fit">
        <button
          onClick={() => {
            setChamber("AN");
            setHoveredGroup(null);
          }}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            chamber === "AN"
              ? "bg-background shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Assemblée nationale
        </button>
        <button
          onClick={() => {
            setChamber("SENAT");
            setHoveredGroup(null);
          }}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            chamber === "SENAT"
              ? "bg-background shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Sénat
        </button>
      </div>

      {/* Hemicycle */}
      <div className="relative max-w-2xl mx-auto">
        <svg
          key={chamber}
          viewBox="0 0 800 440"
          className="w-full"
          role="img"
          aria-label={`Composition ${chamber === "AN" ? "de l'Assemblée nationale" : "du Sénat"} : ${totalSeats} sièges répartis en ${sortedGroups.length} groupes`}
          onMouseMove={handleSvgMouseMove}
          onMouseLeave={() => setHoveredGroup(null)}
          onClick={handleSvgClick}
        >
          {/* Podium arc */}
          <path
            d="M 280 405 Q 400 418 520 405"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="none"
            className="text-border"
            strokeLinecap="round"
          />

          {/* Hit areas (invisible, larger circles for better click/hover targeting) */}
          <g>
            {seats.map((seat, i) => (
              <circle
                key={`hit-${chamber}-${i}`}
                cx={seat.x}
                cy={seat.y}
                r={9}
                fill="transparent"
                data-group={seat.groupCode}
                className="cursor-pointer"
              />
            ))}
          </g>

          {/* Visible seats */}
          <g className="pointer-events-none">
            {seats.map((seat, i) => {
              const isActive = !hoveredGroup || seat.groupCode === hoveredGroup;
              return (
                <circle
                  key={`${chamber}-${i}`}
                  cx={seat.x}
                  cy={seat.y}
                  r={4}
                  fill={seat.groupColor}
                  opacity={isActive ? 1 : 0.12}
                  style={{
                    transition: "opacity 150ms ease",
                    animation: "hemicycleSeatIn 350ms ease-out backwards",
                    animationDelay: `${(seat.x / 800) * 250}ms`,
                  }}
                />
              );
            })}
          </g>

          {/* Center label */}
          <text
            x="400"
            y="435"
            textAnchor="middle"
            className="fill-muted-foreground"
            fontSize="13"
            fontWeight={hoveredData ? "600" : "400"}
          >
            {hoveredData
              ? `${hoveredData.name} - ${hoveredData.seatCount} sièges`
              : `${totalSeats} sièges`}
          </text>
        </svg>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-1.5 justify-center mt-3">
        {sortedGroups.map((g) => (
          <Link
            key={g.code}
            href={g.slug ? ROUTES.groupeDetail(g.slug) : "#"}
            onMouseEnter={() => setHoveredGroup(g.code)}
            onMouseLeave={() => setHoveredGroup(null)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border transition-all duration-150 ${
              hoveredGroup === g.code
                ? "bg-muted border-border shadow-sm"
                : hoveredGroup
                  ? "opacity-30 border-transparent"
                  : "border-transparent hover:bg-muted/50"
            }`}
            prefetch={false}
          >
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: g.color ?? "#999" }}
            />
            <span className="font-medium">{g.name}</span>
            <span className="text-muted-foreground tabular-nums">{g.seatCount}</span>
          </Link>
        ))}
      </div>

      {/* Accessible data table (hidden) */}
      <div className="sr-only">
        <table>
          <caption>
            Composition {chamber === "AN" ? "de l'Assemblée nationale" : "du Sénat"}
          </caption>
          <thead>
            <tr>
              <th>Groupe</th>
              <th>Sièges</th>
            </tr>
          </thead>
          <tbody>
            {sortedGroups.map((g) => (
              <tr key={g.code}>
                <td>{g.name}</td>
                <td>{g.seatCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
