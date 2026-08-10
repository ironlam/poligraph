import { MissingData } from "@/components/ui/MissingData";
import { SourceLine } from "@/components/ui/SourceLine";
import type { CandidacyPhase } from "@/lib/senatoriales/timing";
import {
  CANDIDACY_FEHF_NOTE,
  CANDIDACY_HEADING,
  CANDIDACY_LEDE,
  CANDIDACY_LEDE_AFTER_BALLOT,
  CANDIDACY_MISSING_BODY,
  CANDIDACY_MISSING_TITLE,
  SOURCE_DECREE,
  SOURCE_FEHF_CANDIDACY,
  type BallotPhase,
} from "../_content";

/**
 * État 2: the candidacy deposit period.
 *
 * The block exists to answer "can someone still stand, and who is standing", and it can
 * only answer the first half. So it says the second half is missing rather than
 * approximating it.
 *
 * Two regimes, never merged. The decree convenes 63 circonscriptions, where declarations go
 * to the services of the State's representative from 7 to 11 September at 18 h local. The
 * sixty-fourth, the Français établis hors de France, is not convened by it: article 46 of loi
 * n° 2013-659 sends its declarations to the ministère des Affaires étrangères by the third
 * Monday before the ballot, which is Monday 7 September.
 *
 * Two things it deliberately does not have. There is no counter of circonscriptions whose
 * candidacies we have collected: a gauge reading "21 sur 63" describes our own import
 * progress, and on a page about a ballot it would read as a fact about the ballot. And there
 * is no candidate list, partial or otherwise, because declarations are received
 * circonscription by circonscription and we hold no verified source that spans them.
 *
 * The phase is resolved at read time against the union of the local windows, not against a
 * national hour: see `deriveCandidacyPhase`. The stored `Election.status` column cannot serve
 * here either, because nothing transitions it, so a page trusting it would still announce a
 * deposit period in October.
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

      {/* The decree convenes 63 circonscriptions, so the period above is theirs alone. The
          sixty-fourth files elsewhere, on another date, under another text: leaving it out
          would silently extend a regime to a college it does not govern. */}
      {phase !== "unknown" && (
        <p className="text-sm leading-relaxed text-muted-foreground">{CANDIDACY_FEHF_NOTE}</p>
      )}

      <MissingData title={CANDIDACY_MISSING_TITLE}>{CANDIDACY_MISSING_BODY}</MissingData>

      <SourceLine
        sources={[SOURCE_DECREE, SOURCE_FEHF_CANDIDACY]}
        note="Article 2 du décret pour les 63 circonscriptions, article 46 de la loi de 2013 pour les Français de l'étranger"
        reportHref={null}
      />
    </section>
  );
}
