import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { THEME_ACCENT_BAR, THEME_CATEGORY_LABELS, VOTE_POSITION_LABELS } from "@/config/labels";
import type { CandidateFicheDetail } from "@/lib/data/politician-candidacy";
import { formatDate } from "@/lib/utils";

/**
 * The blocks of the candidate fiche, below its header.
 *
 * Two blocks of the handoff's D3 screen are deliberately absent, and their absence is stated on the
 * page rather than faked: "programme et votes face à face" needs a scrutin attached to a measure
 * (`MeasureVoteLink` carries none yet), and "ce qu'il a fait au pouvoir" needs the post-election
 * tracking models, which are a later lot and hold no rows. Rendering either from what exists today
 * would mean inventing a link the data does not carry.
 */

export function CandidateStats({
  measureCount,
  themesCoveredCount,
  mandateCount,
}: {
  measureCount: number;
  themesCoveredCount: number;
  mandateCount: number;
}) {
  const stats = [
    {
      value: measureCount,
      label: measureCount === 1 ? "mesure documentée" : "mesures documentées",
    },
    { value: themesCoveredCount, label: "sujets couverts sur 13" },
    { value: mandateCount, label: mandateCount === 1 ? "mandat exercé" : "mandats exercés" },
  ];

  return (
    <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {stats.map((stat) => (
        <div key={stat.label} className="rounded-xl border border-border bg-card px-4 py-3">
          <dt className="text-xs text-muted-foreground">{stat.label}</dt>
          <dd className="font-display text-2xl font-extrabold">{stat.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** One line per theme: how many measures, and the first of them quoted. */
export function CandidateThemes({
  themes,
  electionSlug,
}: {
  themes: CandidateFicheDetail["themes"];
  electionSlug: string;
}) {
  if (themes.length === 0) return null;

  return (
    <section aria-labelledby="mesures" className="space-y-3 rounded-xl border bg-card p-4 md:p-6">
      <h2 id="mesures" className="font-display text-xl font-bold tracking-tight">
        Ses mesures, sujet par sujet
      </h2>
      <ul className="divide-y divide-border">
        {themes.map((t) => (
          <li key={t.theme} className="py-3 first:pt-0 last:pb-0">
            <div className="flex items-center gap-2.5">
              <span
                aria-hidden="true"
                className={`h-5 w-1.5 shrink-0 rounded-full ${THEME_ACCENT_BAR[t.theme]}`}
              />
              <Link
                href={`/elections/${electionSlug}/sujets/${t.slug}`}
                prefetch={false}
                className="text-sm font-bold hover:underline"
              >
                {THEME_CATEGORY_LABELS[t.theme]}
              </Link>
              <span className="text-xs text-muted-foreground">
                {t.measureCount} {t.measureCount === 1 ? "mesure" : "mesures"}
              </span>
            </div>
            {t.quote !== null && (
              <p className="mt-1.5 pl-4 text-sm leading-relaxed text-muted-foreground">
                &laquo;&nbsp;{t.quote.text}&nbsp;&raquo;
                {t.quote.sourceUrl !== null && (
                  <>
                    {" "}
                    <a
                      href={t.quote.sourceUrl}
                      target="_blank"
                      rel="nofollow noopener"
                      className="inline-flex items-center gap-1 text-xs underline hover:no-underline"
                    >
                      source
                      <ExternalLink aria-hidden="true" className="h-3 w-3" />
                    </a>
                  </>
                )}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Where the programme puts its accent, as a share of what we extracted.
 *
 * The caption says what the bars measure and what they do not: a long bar means the candidacy
 * talks about a subject often, not that it did anything about it.
 */
export function CandidateThemeSpread({ themes }: { themes: CandidateFicheDetail["themes"] }) {
  if (themes.length === 0) return null;
  const top = themes.slice(0, 5);
  const max = Math.max(...top.map((t) => t.measureCount));

  return (
    <section
      aria-labelledby="repartition"
      className="space-y-3 rounded-xl border bg-card p-4 md:p-6"
    >
      <h2 id="repartition" className="font-display text-xl font-bold tracking-tight">
        Les sujets les plus présents dans son programme
      </h2>
      <ul className="space-y-2">
        {top.map((t) => (
          <li key={t.theme} className="flex items-center gap-3">
            <span className="w-44 shrink-0 truncate text-sm">{THEME_CATEGORY_LABELS[t.theme]}</span>
            <span aria-hidden="true" className="h-2 flex-1 rounded-full bg-muted">
              <span
                className={`block h-2 rounded-full ${THEME_ACCENT_BAR[t.theme]}`}
                style={{ width: `${Math.round((t.measureCount / max) * 100)}%` }}
              />
            </span>
            <span className="w-6 shrink-0 text-right text-sm font-bold">{t.measureCount}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        Compte le nombre de mesures que nous avons dépouillées par sujet. Mesure ce dont la
        candidature parle, pas ce qui a été réalisé.
      </p>
    </section>
  );
}

export function CandidateRecentVotes({
  votes,
  politicianSlug,
}: {
  votes: CandidateFicheDetail["recentVotes"];
  politicianSlug: string;
}) {
  if (votes.length === 0) return null;

  return (
    <section aria-labelledby="votes" className="space-y-3 rounded-xl border bg-card p-4 md:p-6">
      <h2 id="votes" className="font-display text-xl font-bold tracking-tight">
        Ses derniers votes
      </h2>
      <ul className="divide-y divide-border">
        {votes.map((v) => (
          <li key={v.id} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
            <span className="w-20 shrink-0 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {VOTE_POSITION_LABELS[v.position]}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm">{v.scrutinTitle}</span>
              <span className="text-xs text-muted-foreground">{formatDate(v.votingDate)}</span>
            </span>
          </li>
        ))}
      </ul>
      {/* The caveat is not decoration: a public scrutin covers a fraction of parliamentary work,
          and a reader who takes this list for the whole record misreads it. */}
      <p className="text-xs text-muted-foreground">
        Un scrutin public ne couvre pas tout le travail parlementaire : commissions, rapports et
        amendements n&apos;y figurent pas. Ces votes ne sont pas rattachés aux mesures ci-dessus, ce
        rapprochement reste à construire.
      </p>
      <Link
        href={`/politiques/${politicianSlug}`}
        prefetch={false}
        className="inline-block text-sm font-bold text-primary hover:underline"
      >
        Voir tous ses votes
      </Link>
    </section>
  );
}

/**
 * Integrity, stated in counts and never in adjectives.
 *
 * The caveat is required, not editorial politeness: an ongoing procedure is not a conviction, and
 * a bare number next to a candidate's name invites exactly that reading.
 */
export function CandidateIntegrity({
  declarationCount,
  affairCount,
  politicianSlug,
}: {
  declarationCount: number;
  affairCount: number;
  politicianSlug: string;
}) {
  return (
    <section aria-labelledby="integrite" className="space-y-3 rounded-xl border bg-card p-4 md:p-6">
      <h2 id="integrite" className="font-display text-xl font-bold tracking-tight">
        Intégrité
      </h2>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-border px-4 py-3">
          <dt className="text-xs text-muted-foreground">Déclarations HATVP</dt>
          <dd className="text-sm font-bold">
            {declarationCount === 0
              ? "Aucune déclaration publiée"
              : `${declarationCount} ${declarationCount === 1 ? "déclaration publiée" : "déclarations publiées"}`}
          </dd>
        </div>
        <div className="rounded-lg border border-border px-4 py-3">
          <dt className="text-xs text-muted-foreground">Procédures judiciaires</dt>
          <dd className="text-sm font-bold">
            {affairCount === 0
              ? "Aucune procédure documentée"
              : `${affairCount} ${affairCount === 1 ? "procédure documentée" : "procédures documentées"}`}
          </dd>
        </div>
      </dl>
      <p className="text-xs text-muted-foreground">
        Quand une procédure existe, son statut exact figure sur sa fiche. Une mise en cause ne vaut
        pas condamnation.
      </p>
      <Link
        href={`/politiques/${politicianSlug}`}
        prefetch={false}
        className="inline-block text-sm font-bold text-primary hover:underline"
      >
        Voir le détail sur sa fiche
      </Link>
    </section>
  );
}
