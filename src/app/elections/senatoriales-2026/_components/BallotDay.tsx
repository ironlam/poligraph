import { MissingData } from "@/components/ui/MissingData";
import { SourceLine } from "@/components/ui/SourceLine";
import {
  BALLOT_DAY_HEADING,
  BALLOT_DAY_LEDE,
  BALLOT_DAY_NO_RESULTS_BODY,
  BALLOT_DAY_NO_RESULTS_TITLE,
  SOURCE_DECREE,
} from "../_content";

/**
 * État 3: the day of the ballot.
 *
 * Rendered only on the ballot's own calendar day in Paris, which is narrower than the
 * polling-day phase: that phase spans the 24 hours after a round date stored at midnight
 * UTC, so it would keep "aujourd'hui" on screen until 02:00 the following morning.
 *
 * The hours live in `ScrutinRules` and are not repeated here: they carry a caveat about
 * the sixty-fourth constituency, and a caveat shown twice is a caveat that will drift.
 *
 * Nothing here counts, estimates or trends. The block states that refusal rather than
 * merely omitting it, because on the evening of a ballot an empty space reads as a
 * result that has not loaded yet.
 */
export function BallotDay() {
  return (
    <section aria-labelledby="jour-scrutin-heading" className="space-y-4">
      <div className="space-y-2">
        <h2
          id="jour-scrutin-heading"
          className="font-display text-xl font-bold tracking-tight md:text-2xl"
        >
          {BALLOT_DAY_HEADING}
        </h2>
        <p className="max-w-3xl text-sm text-muted-foreground md:text-base">{BALLOT_DAY_LEDE}</p>
      </div>

      <MissingData title={BALLOT_DAY_NO_RESULTS_TITLE}>{BALLOT_DAY_NO_RESULTS_BODY}</MissingData>

      <SourceLine
        sources={[SOURCE_DECREE]}
        note="Horaires fixés par l'article 3 du décret"
        reportHref={null}
      />
    </section>
  );
}
