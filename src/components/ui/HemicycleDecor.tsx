import { cn } from "@/lib/utils";

const ANNEAUX = [
  { rayon: 110, points: 12 },
  { rayon: 150, points: 16 },
  { rayon: 190, points: 20 },
  { rayon: 230, points: 24 },
];

export function hemicycleDots() {
  return ANNEAUX.flatMap(({ rayon, points }, anneau) =>
    Array.from({ length: points }, (_, i) => {
      const angle = Math.PI * (i / (points - 1));
      return {
        cx: Math.round((240 - rayon * Math.cos(angle)) * 10) / 10,
        cy: Math.round((245 - rayon * Math.sin(angle)) * 10) / 10,
        clair: (i * 7 + anneau * 3) % 11 === 0,
      };
    })
  );
}

/** Décor du bandeau marine. Non signifiant : à ne jamais relier à des données ou des partis. */
export function HemicycleDecor({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 480 250"
      aria-hidden="true"
      focusable="false"
      className={cn("text-white", className)}
    >
      {hemicycleDots().map((d) => (
        <circle
          key={`${d.cx}-${d.cy}`}
          cx={d.cx}
          cy={d.cy}
          r={5}
          fill="currentColor"
          fillOpacity={d.clair ? 0.7 : 0.2}
        />
      ))}
    </svg>
  );
}
