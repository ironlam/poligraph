import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { VerdictBreakdownBar } from "@/components/factchecks/politique/PoliticianFactChecks";
import { FACTCHECK_RATING_COLORS, FACTCHECK_RATING_LABELS } from "@/config/labels";
import {
  factCheckPoliticianPath,
  getPoliticianFactCheckLanding,
} from "@/lib/data/factcheck-politician";
import {
  selectCandidateFactChecks,
  type CandidateFactCheckSummary,
} from "@/lib/presidentielle/candidate-fiche-links";
import { formatDate } from "@/lib/utils";

function plural(count: number, one: string, many: string): string {
  if (count > 1) return many;
  return one;
}

/**
 * The candidate's verified claims, in the compact form a phone can scroll past: one line of counts,
 * the verdict bar, the three most recent checks and one link to the full record.
 *
 * Poligraph does not check claims itself. The caveat says so before the list, because a verdict
 * shown on a candidate's page during a campaign reads as ours unless the outlet is named, and each
 * row names it.
 */
export function CandidateFactChecks({ summary }: { summary: CandidateFactCheckSummary }) {
  const { total, sourceCount, breakdown, recent, href } = summary;

  return (
    <section
      aria-labelledby="fact-checks"
      className="space-y-3 rounded-xl border bg-card p-4 md:p-6"
    >
      <h2 id="fact-checks" className="font-display text-xl font-bold tracking-tight">
        Ses déclarations vérifiées
      </h2>
      <p className="text-sm text-muted-foreground-strong">
        {total.toLocaleString("fr-FR")}{" "}
        {plural(total, "déclaration vérifiée", "déclarations vérifiées")} par{" "}
        {sourceCount.toLocaleString("fr-FR")}{" "}
        {plural(sourceCount, "rédaction de fact-checking", "rédactions de fact-checking")}. Les
        verdicts sont ceux des rédactions.
      </p>
      <VerdictBreakdownBar breakdown={breakdown} total={total} />
      <ul className="divide-y divide-border">
        {recent.map((item) => (
          <li key={item.slug}>
            <Link
              href={`/factchecks/${item.slug}`}
              prefetch={false}
              className="group flex min-h-11 flex-col gap-1 py-2.5"
            >
              <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
                <Badge className={FACTCHECK_RATING_COLORS[item.verdictRating]}>
                  {FACTCHECK_RATING_LABELS[item.verdictRating]}
                </Badge>
                <span>{item.source}</span>
                <span>{formatDate(item.publishedAt)}</span>
              </span>
              <span className="text-sm font-medium group-hover:underline">{item.title}</span>
            </Link>
          </li>
        ))}
      </ul>
      {/* "Toutes" only when there is more to see: with three or fewer, the list above is the whole
          record and the link would promise nothing new. */}
      <Link
        href={href}
        prefetch={false}
        className="inline-flex min-h-11 items-center text-sm font-bold text-primary hover:underline"
      >
        {total > recent.length
          ? `Voir ses ${total.toLocaleString("fr-FR")} déclarations vérifiées`
          : "Voir le détail par verdict et par rédaction"}
      </Link>
    </section>
  );
}

/**
 * Data boundary for the block. Reads the same cached landing as /factchecks/politique/[slug]
 * (tagged `factchecks` and `politician:<slug>`), so both pages count the same claims and a new
 * fact-check refreshes both. Renders nothing below one verified claim.
 */
export async function CandidateFactChecksSection({ slug }: { slug: string }) {
  const summary = selectCandidateFactChecks(await getPoliticianFactCheckLanding(slug), {
    landing: factCheckPoliticianPath(slug),
    filtered: `/factchecks?politician=${encodeURIComponent(slug)}`,
  });
  if (!summary) return null;
  return <CandidateFactChecks summary={summary} />;
}
