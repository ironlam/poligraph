import Link from "next/link";
import { ChevronRight, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { BannerCountdown } from "@/components/home/BannerCountdown";
import type { FeaturedElection } from "@/lib/data/elections";
import { deriveElectionBannerState } from "@/lib/elections/banner-state";
import { getBannerPresentation, type BannerAction } from "@/lib/elections/banner-presentation";
import { getVoterRegistrationDeadline } from "@/config/election-guides";
import { formatDate, formatPct } from "@/lib/utils";

/**
 * Homepage election banner. Occupies its existing slot between HomeHero and HomeIntentGrid and does
 * not leave it: the homepage stays an observatory's homepage, not an election page.
 *
 * The component knows neither the presidential race nor the municipal one. It renders a temporal
 * state (banner-state.ts) crossed with a presentation strategy (banner-presentation.ts).
 *
 * `now` is injected rather than read here so the five states are testable without touching the
 * render clock.
 */

interface ElectionBannerProps {
  election: FeaturedElection;
  now: Date;
}

function ActionLink({
  action,
  variant,
}: {
  action: BannerAction;
  variant: "primary" | "secondary";
}) {
  const className =
    variant === "primary"
      ? "flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      : "flex min-h-8 items-center justify-center gap-1 text-sm font-bold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

  const content = (
    <>
      {action.label}
      <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
    </>
  );

  if (action.external) {
    return (
      <a href={action.href} target="_blank" rel="noopener noreferrer" className={className}>
        {content}
      </a>
    );
  }

  return (
    <Link href={action.href} prefetch={false} className={className}>
      {content}
    </Link>
  );
}

export function ElectionBanner({ election, now }: ElectionBannerProps) {
  const state = deriveElectionBannerState({
    round1Date: election.round1Date,
    round2Date: election.round2Date,
    now,
    round1Scores: election.round1Scores,
    winner: election.winner,
  });
  // No dates means nothing to announce and nothing to count toward.
  if (state === null) return null;

  const presentation = getBannerPresentation(election.type);
  const ctx = {
    electionSlug: election.slug,
    sourcedCandidacyCount: election.sourcedCandidacyCount,
  };
  const primary = presentation.primaryAction(state.kind, ctx);
  const secondary = presentation.secondaryAction(state.kind, ctx);
  const label = election.shortTitle || election.title;

  // A 3px gradient rule, never a coloured background: a solid fill would read as campaign material
  // and would crush the rest of the page.
  const rule =
    state.kind === "AFTER"
      ? "bg-border"
      : state.kind === "VOTING_DAY"
        ? "bg-brand"
        : "bg-gradient-to-r from-brand to-primary";

  const registrationDeadline =
    state.kind === "LAST_MONTH" ? getVoterRegistrationDeadline(election.slug, now) : null;

  const roundSuffix =
    state.kind === "VOTING_DAY"
      ? state.round === 1
        ? " · 1er tour"
        : " · 2d tour"
      : state.kind === "BETWEEN_ROUNDS"
        ? " · 2d tour"
        : state.kind === "AFTER"
          ? " · terminée"
          : "";

  return (
    // Plain div rather than <Card>: Card carries py-6, and the gradient rule has to sit flush
    // against the top edge.
    <section
      aria-labelledby="election-banner-label"
      className="overflow-hidden rounded-xl border bg-card"
    >
      <div className={`h-[3px] ${rule}`} aria-hidden="true" />
      <div className="flex flex-col gap-4 p-4 md:grid md:grid-cols-[1fr_auto_auto] md:items-center md:gap-9 md:p-6">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span
              id="election-banner-label"
              className={`text-xs font-bold uppercase tracking-widest ${
                state.kind === "AFTER" ? "text-muted-foreground" : "text-brand"
              }`}
            >
              {label}
              {roundSuffix}
            </span>
            {!election.dateConfirmed && state.kind !== "AFTER" && (
              <Badge variant="outline" className="text-[10px]">
                Dates provisoires
              </Badge>
            )}
          </div>

          {state.kind === "VOTING_DAY" && (
            <p className="font-display text-lg font-extrabold leading-tight">
              Les bureaux ferment dans
            </p>
          )}

          {state.kind === "AFTER" && presentation.showWinnerScore && election.winner && (
            <p className="font-display text-lg font-extrabold leading-tight">
              {election.winner.candidateName} élu·e avec {formatPct(election.winner.pct)} des voix
            </p>
          )}

          {presentation.promise && state.kind !== "VOTING_DAY" && (
            <p className="text-sm leading-snug md:text-base">{presentation.promise}</p>
          )}

          {election.round1Date && state.kind !== "AFTER" && (
            <p className="text-xs text-muted-foreground">
              1er tour le {formatDate(election.round1Date)}
              {election.round2Date && <> · 2d tour le {formatDate(election.round2Date)}</>}
            </p>
          )}

          {registrationDeadline && (
            <p className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs leading-snug text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                Inscription sur les listes électorales : jusqu&apos;au{" "}
                {formatDate(registrationDeadline)}.
              </span>
            </p>
          )}

          {state.kind === "BETWEEN_ROUNDS" &&
            presentation.showRound1Scores &&
            state.round1Scores.length > 0 && (
              <div className="mt-1 flex flex-col gap-1 border-t border-border pt-3">
                <span className="text-xs font-bold text-muted-foreground">
                  Résultats du 1er tour
                </span>
                {state.round1Scores.map((score) => (
                  <span
                    key={score.candidateName}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <span>
                      {score.candidateName}
                      {score.partyLabel && (
                        <span className="text-muted-foreground"> ({score.partyLabel})</span>
                      )}
                    </span>
                    <span className="font-bold tabular-nums">{formatPct(score.pct)}</span>
                  </span>
                ))}
              </div>
            )}
        </div>

        {state.kind !== "AFTER" && (
          <div className="md:border-l md:border-border md:pl-9">
            <BannerCountdown
              targetDate={state.targetDate.toISOString()}
              showSeconds={state.showSeconds}
              label={
                state.kind === "VOTING_DAY"
                  ? "Compte à rebours jusqu'à la fermeture des bureaux"
                  : `Compte à rebours jusqu'au ${state.kind === "BETWEEN_ROUNDS" ? "second" : "premier"} tour`
              }
            />
          </div>
        )}

        <div className="flex flex-col gap-2 md:min-w-52">
          <ActionLink action={primary} variant="primary" />
          {secondary && <ActionLink action={secondary} variant="secondary" />}
        </div>
      </div>
    </section>
  );
}
