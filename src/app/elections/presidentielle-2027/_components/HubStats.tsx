import { formatDate } from "@/lib/utils";

/**
 * Launch-honest reporting (spec §4.3): a count of verified measures and the date they were last
 * reviewed, never a percentage. There is no denominator that would make a "100 %" true at launch,
 * so the component never computes one. At zero, it says so plainly instead of hiding the section.
 */

interface HubStatsProps {
  verifiedMeasureCount: number;
  lastReviewedAt: Date | null;
}

export function HubStats({ verifiedMeasureCount, lastReviewedAt }: HubStatsProps) {
  if (verifiedMeasureCount === 0 && lastReviewedAt === null) {
    return (
      <section
        aria-label="Mesures vérifiées"
        className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground"
      >
        Aucune mesure vérifiée pour l&apos;instant.
      </section>
    );
  }

  const countLabel = `${verifiedMeasureCount} mesure${verifiedMeasureCount === 1 ? "" : "s"} vérifiée${verifiedMeasureCount === 1 ? "" : "s"}`;

  return (
    <section aria-label="Mesures vérifiées" className="rounded-lg border border-border p-4 text-sm">
      <p className="font-medium">{countLabel}</p>
      {lastReviewedAt !== null && (
        <p className="mt-1 text-muted-foreground">Dernière revue le {formatDate(lastReviewedAt)}</p>
      )}
    </section>
  );
}
