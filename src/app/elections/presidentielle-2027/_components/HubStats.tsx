import { formatDate } from "@/lib/utils";

/**
 * Launch-honest reporting (spec §4.3): a count of published measures and the date they were last
 * reviewed, never a percentage. There is no denominator that would make a "100 %" true at launch,
 * so the component never computes one. At zero, it says so plainly instead of hiding the section.
 *
 * Deliberately not rendered as a bare number tile like a sibling stat ("13 sujets suivis"):
 * a lone count next to other tiles implies a ratio, and there isn't one at launch. Framing
 * (border, card) is left to the caller since this sits inside the hero card on desktop and
 * inside its own block on mobile.
 */

interface HubStatsProps {
  verifiedMeasureCount: number;
  lastReviewedAt: Date | null;
}

export function HubStats({ verifiedMeasureCount, lastReviewedAt }: HubStatsProps) {
  if (verifiedMeasureCount === 0 && lastReviewedAt === null) {
    return (
      <section
        aria-label="Mesures publiées sur Poligraph"
        className="text-sm text-muted-foreground"
      >
        <p className="font-display text-3xl font-extrabold tabular-nums tracking-tight text-primary">
          0
        </p>
        <p className="mt-0.5 text-xs">Aucune mesure publiée pour l&apos;instant.</p>
      </section>
    );
  }

  const countLabel = `${verifiedMeasureCount} mesure${verifiedMeasureCount === 1 ? "" : "s"} publiée${verifiedMeasureCount === 1 ? "" : "s"}`;

  return (
    <section aria-label="Mesures publiées sur Poligraph" className="text-sm">
      <p className="font-display text-3xl font-extrabold tabular-nums tracking-tight text-primary">
        {verifiedMeasureCount}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground-strong">{countLabel}</p>
      {lastReviewedAt !== null && (
        <p className="mt-2 text-xs text-muted-foreground">
          Dernière revue éditoriale le {formatDate(lastReviewedAt)}
        </p>
      )}
    </section>
  );
}
