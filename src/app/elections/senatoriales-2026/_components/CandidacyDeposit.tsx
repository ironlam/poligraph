import { MissingData } from "@/components/ui/MissingData";
import { SourceLine } from "@/components/ui/SourceLine";
import type { CandidacyPhase } from "@/lib/senatoriales/timing";
import {
  CANDIDACY_HEADING,
  CANDIDACY_LEDE,
  CANDIDACY_LEDE_AFTER_BALLOT,
  CANDIDACY_MISSING_BODY,
  CANDIDACY_MISSING_TITLE,
  SOURCE_DECREE,
  type BallotPhase,
} from "../_content";

/**
 * État 2: the candidacy deposit window.
 *
 * The block exists to answer "can someone still stand, and who is standing", and it can
 * only answer the first half. So it says the second half is missing rather than
 * approximating it.
 *
 * Two things it deliberately does not have. There is no counter of departments whose
 * candidacies we have collected: a gauge reading "21 sur 63" describes our own import
 * progress, and on a page about a ballot it would read as a fact about the ballot. And
 * there is no candidate list, partial or otherwise, because declarations are filed
 * préfecture by préfecture and we hold no verified source that spans them.
 *
 * The phase comes from the two instants the decree fixes, resolved at read time. The
 * stored `Election.status` column cannot serve here: nothing transitions it, so a page
 * trusting it would still announce a deposit window in October.
 */
export function CandidacyDeposit({
  phase,
  ballotPhase,
}: {
  phase: CandidacyPhase;
  ballotPhase: BallotPhase;
}) {
  // Two axes, because "clos" means something different before and after the ballot: the
  // pre-ballot copy states a rule about a second round that would read as still
  // applicable on 28 September.
  const lede =
    phase === "closed" && ballotPhase === "after"
      ? CANDIDACY_LEDE_AFTER_BALLOT
      : CANDIDACY_LEDE[phase];

  return (
    <section aria-labelledby="candidatures-heading" className="space-y-4">
      <h2
        id="candidatures-heading"
        className="font-display text-xl font-bold tracking-tight md:text-2xl"
      >
        {CANDIDACY_HEADING}
      </h2>

      {/* An unrecorded window is a data gap, not a phase: it gets the dashed box rather
          than a confident sentence about a date we do not have. */}
      {phase === "unknown" ? (
        <MissingData title={lede.headline}>{lede.body}</MissingData>
      ) : (
        <div className="rounded-xl border border-border p-4">
          <p className="font-semibold">{lede.headline}</p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{lede.body}</p>
        </div>
      )}

      <MissingData title={CANDIDACY_MISSING_TITLE}>{CANDIDACY_MISSING_BODY}</MissingData>

      <SourceLine
        sources={[SOURCE_DECREE]}
        note="Dates de dépôt fixées par l'article 2 du décret"
        reportHref={null}
      />
    </section>
  );
}
