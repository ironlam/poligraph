import { Card, CardContent } from "@/components/ui/card";
import { MissingData } from "@/components/ui/MissingData";
import { SourceLine } from "@/components/ui/SourceLine";
import type { SenatorialesResultsSummary } from "@/lib/senatoriales/results-summary";
import {
  RESULTS_FOLLOW_UP_BODY,
  RESULTS_FOLLOW_UP_TITLE,
  RESULTS_HEADING,
  RESULTS_LABEL_CONSTITUENCIES,
  RESULTS_LABEL_NEWCOMERS,
  RESULTS_LABEL_REELECTED,
  RESULTS_LABEL_WOMEN,
  RESULTS_LEDE_COMPLETE,
  RESULTS_PRESIDENCY_BODY,
  RESULTS_PRESIDENCY_TITLE,
  RESULTS_UNRESOLVED_TITLE,
  RESULTS_WOMEN_MISSING_BODY,
  RESULTS_WOMEN_MISSING_TITLE,
  SOURCE_INTERIOR_RESULTS,
  SOURCE_LO_135_1,
  SOURCE_SENATORIALES_SITE,
  resultsLedePartial,
  resultsUnresolvedBody,
} from "../_content";

const ALL_SEATS = 178;

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <dd className="font-display text-3xl font-extrabold leading-none tabular-nums">{value}</dd>
      <dt className="mt-1.5 text-sm">{label}</dt>
    </div>
  );
}

/**
 * État 4 of the hub: the Senate the day after.
 *
 * Every figure is either established or replaced by a stated absence. Re-elected and
 * newcomers stay missing while one elected person is not linked to a record, because
 * each unresolved person would otherwise land in one of the two counts by default.
 */
export function ResultsOverview({ summary }: { summary: SenatorialesResultsSummary }) {
  const complete = summary.seatsFilled === ALL_SEATS;
  const women = summary.womenShare === null ? null : `${Math.round(summary.womenShare * 100)} %`;

  return (
    <section aria-labelledby="resultats-heading" className="space-y-4">
      <div className="space-y-2">
        <h2
          id="resultats-heading"
          className="font-display text-xl font-bold tracking-tight md:text-2xl"
        >
          {RESULTS_HEADING}
        </h2>
        <p className="max-w-3xl text-sm text-muted-foreground md:text-base">
          {complete
            ? RESULTS_LEDE_COMPLETE
            : resultsLedePartial(summary.proclaimedConstituencies, summary.seatsFilled)}
        </p>
      </div>

      <Card>
        <CardContent className="space-y-4">
          <dl className="grid grid-cols-2 gap-6 md:grid-cols-4">
            {summary.unresolved === 0 && (
              <>
                <Stat value={String(summary.reelected)} label={RESULTS_LABEL_REELECTED} />
                <Stat value={String(summary.newcomers)} label={RESULTS_LABEL_NEWCOMERS} />
              </>
            )}
            {women !== null && <Stat value={women} label={RESULTS_LABEL_WOMEN} />}
            <Stat
              value={String(summary.proclaimedConstituencies)}
              label={RESULTS_LABEL_CONSTITUENCIES}
            />
          </dl>

          {summary.unresolved > 0 && (
            <MissingData title={RESULTS_UNRESOLVED_TITLE}>
              {resultsUnresolvedBody(summary.unresolved)}
            </MissingData>
          )}
          {women === null && (
            <MissingData title={RESULTS_WOMEN_MISSING_TITLE}>
              {RESULTS_WOMEN_MISSING_BODY}
            </MissingData>
          )}

          <SourceLine
            sources={[SOURCE_INTERIOR_RESULTS]}
            consultedAt={summary.lastImportedAt}
            reportHref={null}
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-border p-5">
          <h3 className="font-display text-lg font-bold">{RESULTS_PRESIDENCY_TITLE}</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {RESULTS_PRESIDENCY_BODY}
          </p>
          <SourceLine className="mt-3" sources={[SOURCE_SENATORIALES_SITE]} reportHref={null} />
        </div>
        <div className="rounded-xl border border-border p-5">
          <h3 className="font-display text-lg font-bold">{RESULTS_FOLLOW_UP_TITLE}</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {RESULTS_FOLLOW_UP_BODY}
          </p>
          <SourceLine
            className="mt-3"
            sources={[SOURCE_SENATORIALES_SITE, SOURCE_LO_135_1]}
            reportHref={null}
          />
        </div>
      </div>
    </section>
  );
}
