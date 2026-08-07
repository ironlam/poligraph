import Link from "next/link";
import { ChevronRight, CircleX, ExternalLink, Landmark, TrendingUp } from "lucide-react";
import {
  CANDIDACY_STATUS_LABELS,
  candidacyPossibleLabel,
  candidacyRoleLabel,
} from "@/config/labels";
import type { PoliticianCandidacy } from "@/lib/data/politician-candidacy";
import { deriveCandidacyNoticeState } from "@/lib/politicians/candidacy-notice-state";
import { formatDate } from "@/lib/utils";

/**
 * Candidacy notice on a politician's fiche. Full width, under the badges, above the tabs, at both
 * widths.
 *
 * Two placement decisions are load-bearing and belong in the caller's tree, not here: no
 * "candidat 2027" badge is added to the party/mandate badge row (there it would read as a
 * qualification awarded by Poligraph), and the notice sits before the tabs because the tabs are
 * where reading engages, so whatever changes the frame has to be read first.
 *
 * A merely rumoured candidacy is rendered deliberately weaker: no accent rule, no coloured pill, a
 * conditional title. A press mention must not look like a declaration.
 */

interface CandidacyNoticeProps {
  candidacy: PoliticianCandidacy;
  /** Drives the gender of the notice title. */
  civility: string | null;
  now: Date;
}

/** French percentage: comma as decimal separator, one decimal, non-breaking space before %. */
function formatPct(pct: number): string {
  return `${pct.toFixed(1).replace(".", ",")} %`;
}

/**
 * Plural agreement on the counters.
 *
 * Not cosmetic: `isFicheCandidatPublishable` opens the state at ONE primary-sourced measure, so
 * "1 mesures sur 1 sujets" is reachable the day a candidacy crosses the gate with a single measure.
 */
function plural(count: number, singular: string): string {
  return `${count} ${singular}${count > 1 ? "s" : ""}`;
}

export function CandidacyNotice({ candidacy, civility, now }: CandidacyNoticeProps) {
  const state = deriveCandidacyNoticeState(candidacy, now);
  const hubHref = `/elections/${candidacy.electionSlug}`;
  const accented = state.kind === "DECLARED_WITH_MEASURES" || state.kind === "DECLARED_EMPTY";

  const Icon = state.kind === "WITHDRAWN" ? CircleX : state.kind === "PAST" ? TrendingUp : Landmark;

  const title =
    state.kind === "POSSIBLE"
      ? candidacyPossibleLabel(civility)
      : state.kind === "WITHDRAWN"
        ? `Candidature retirée${candidacy.withdrewAt ? ` le ${formatDate(candidacy.withdrewAt)}` : ""}`
        : state.kind === "PAST"
          ? `${candidacyRoleLabel(civility)} en 2027`
          : candidacyRoleLabel(civility);

  // The status pill sits next to the source link, which is why it is not simply dropped when it
  // repeats the title. Observed on the only withdrawn candidacy in production: with `withdrewAt`
  // null, the title falls back to "Candidature retirée", which is verbatim
  // CANDIDACY_STATUS_LABELS.RETIRE, and the page printed the same sentence twice in a row. Guarding
  // on equality rather than on the state kills the whole class, including a future label edit that
  // would make another state collide.
  const showStatusPill =
    state.kind !== "PAST" && CANDIDACY_STATUS_LABELS[candidacy.status] !== title;

  const explanation =
    state.kind === "DECLARED_EMPTY"
      ? "Aucune mesure publiée à ce jour. Nous publions une mesure quand elle est sourcée et relue, pas à l'annonce."
      : state.kind === "POSSIBLE"
        ? "Rien n'a été déclaré. La mention vient de la presse, elle est datée, et elle disparaît si elle n'est pas confirmée."
        : state.kind === "WITHDRAWN" && candidacy.publishedMeasureCount > 0
          ? // The date lives in the title, so the sentence can only point at it when it exists.
            // Without it, naming the gap beats implying a dating we do not hold.
            candidacy.withdrewAt
            ? `Les ${plural(candidacy.publishedMeasureCount, "mesure")} documentées restent consultables, datées de la période de campagne.`
            : `Les ${plural(candidacy.publishedMeasureCount, "mesure")} documentées restent consultables. Date du retrait non renseignée.`
          : null;

  const footer =
    state.kind === "DECLARED_WITH_MEASURES"
      ? {
          // Until the candidate fiche route exists (PR C), the hub is the destination. The link
          // announces the volume either way, so the reader knows what they will find.
          href: hubHref,
          label: "Son programme, sujet par sujet",
          detail: `${plural(candidacy.publishedMeasureCount, "mesure")} sur ${plural(candidacy.themesCoveredCount, "sujet")}${
            candidacy.lastReviewedAt ? ` · revue le ${formatDate(candidacy.lastReviewedAt)}` : ""
          }`,
        }
      : state.kind === "DECLARED_EMPTY"
        ? {
            href: hubHref,
            label: `Suivre le dossier ${candidacy.electionShortTitle}`,
            detail: null,
          }
        : state.kind === "WITHDRAWN"
          ? { href: hubHref, label: "Son programme, archivé", detail: null }
          : state.kind === "PAST"
            ? { href: hubHref, label: "Résultats et programme de 2027", detail: null }
            : { href: hubHref, label: "Voir toutes les candidatures", detail: null };

  return (
    <section
      className={`overflow-hidden rounded-xl border bg-card ${
        accented ? "border-l-4 border-l-brand" : ""
      }`}
      aria-labelledby="candidacy-notice-title"
    >
      <div className="flex items-start gap-3 p-4 md:items-center md:gap-4 md:p-5">
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
            accented ? "bg-brand/12 text-brand" : "bg-muted text-muted-foreground"
          }`}
        >
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1 space-y-1.5">
          <p
            className={`text-xs font-bold uppercase tracking-widest ${
              accented ? "text-brand" : "text-muted-foreground"
            }`}
          >
            {candidacy.electionShortTitle}
          </p>
          <p
            id="candidacy-notice-title"
            className="font-display text-base font-bold leading-tight md:text-lg"
          >
            {title}
          </p>

          {state.kind !== "PAST" && (
            <p className="flex flex-wrap items-center gap-2">
              {showStatusPill && (
                <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-bold text-muted-foreground">
                  {CANDIDACY_STATUS_LABELS[candidacy.status]}
                </span>
              )}
              <a
                href={candidacy.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] underline hover:no-underline"
              >
                {candidacy.sourceLabel}
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </a>
            </p>
          )}

          {state.kind === "PAST" && state.results && (
            <p className="text-xs leading-snug text-muted-foreground">
              {state.results.round1Pct !== null && (
                <>{formatPct(state.results.round1Pct)} au 1er tour</>
              )}
              {state.results.round1Pct !== null && state.results.round2Pct !== null && ", "}
              {state.results.round2Pct !== null && (
                <>{formatPct(state.results.round2Pct)} au second</>
              )}
              {candidacy.publishedMeasureCount > 0 && (
                <>. Ses {candidacy.publishedMeasureCount} mesures restent liées à cette campagne.</>
              )}
            </p>
          )}

          {explanation && (
            <p className="text-xs leading-snug text-muted-foreground">{explanation}</p>
          )}
        </div>
      </div>

      <Link
        href={footer.href}
        prefetch={false}
        className="flex min-h-14 items-center gap-3 border-t border-border bg-muted px-4 py-3 transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-primary">{footer.label}</span>
          {footer.detail && (
            <span className="mt-0.5 block text-xs text-muted-foreground">{footer.detail}</span>
          )}
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      </Link>
    </section>
  );
}
