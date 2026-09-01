import Link from "next/link";
import { ArrowRight, ExternalLink } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { THEME_ACCENT_BAR, THEME_CATEGORY_LABELS, VOTE_POSITION_LABELS } from "@/config/labels";
import type { CandidateFicheDetail } from "@/lib/data/politician-candidacy";
import { THEMES_IN_ORDER } from "@/lib/presidentielle/themes";
import { cn, formatDate } from "@/lib/utils";

/**
 * The blocks of the candidate fiche, below its header.
 *
 * Two blocks of the handoff's D3 screen are deliberately absent, and their absence is stated on the
 * page rather than faked: "programme et votes face à face" needs a scrutin attached to a measure
 * (`MeasureVoteLink` carries none yet), and "ce qu'il a fait au pouvoir" needs the post-election
 * tracking models, which are a later lot and hold no rows. Rendering either from what exists today
 * would mean inventing a link the data does not carry.
 */

/**
 * The generated synthesis, when there is one.
 *
 * It renders above everything it summarises, and says so in the same breath: the
 * reader is told the text is generated, from what, and when, before reading a word
 * of it. That ordering is the point. A summary of someone's programme placed on
 * their page during a campaign is only defensible if the reader can immediately see
 * what it was built from, and the blocks below this one are exactly that.
 *
 * The model separates the career and programme with a blank line. Render those blocks
 * as real paragraphs so the synthesis remains readable and keeps a meaningful HTML
 * structure. The card follows the page grid, while its text column stays at a comfortable
 * reading width on large screens.
 */
export function CandidateSynthesis({
  synthesis,
  generatedAt,
  measureCount,
}: {
  synthesis: string | null;
  generatedAt: Date | null;
  measureCount: number;
}) {
  if (synthesis === null) return null;

  const paragraphs = synthesis
    .trim()
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean);

  return (
    <section
      aria-labelledby="synthese-titre"
      className="rounded-xl border border-border bg-muted/40 px-5 py-4"
    >
      <div className="max-w-[78ch]">
        <h2 id="synthese-titre" className="font-display text-lg font-extrabold">
          En résumé
        </h2>
        <p className="mt-1 max-w-[70ch] text-xs leading-relaxed text-muted-foreground">
          Texte généré à partir des mandats, des votes et des{" "}
          {measureCount === 1 ? "mesures" : `${measureCount} mesures`} publiées ci-dessous
          {generatedAt !== null && <>, le {formatDate(generatedAt)}</>}. Il n&apos;ajoute aucune
          information qui ne figure sur cette page.
        </p>
        <div className="mt-4 space-y-4 text-base leading-7">
          {paragraphs.map((paragraph, index) => (
            <p key={`${index}-${paragraph.slice(0, 32)}`}>{paragraph}</p>
          ))}
        </div>
      </div>
    </section>
  );
}

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
      label: measureCount === 1 ? "proposition publiée" : "propositions publiées",
    },
    {
      value: themesCoveredCount,
      label: `thématiques couvertes sur ${THEMES_IN_ORDER.length}`,
    },
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

/**
 * Every documented measure for a short programme, or a navigable overview for a large one.
 * We never quote an arbitrary "first" measure: import order has no editorial meaning.
 *
 * The closing link acts on what was just read, so it belongs to this section rather than floating
 * between two others. Every candidacy gets the same stable measures URL, including short
 * programmes whose complete contents also remain visible on the fiche.
 */
export const INLINE_PROGRAMME_MEASURE_LIMIT = 15;
const MEASURE_ACTION_CLASS_NAME = cn(
  buttonVariants({ variant: "link" }),
  "h-auto min-h-11 justify-start whitespace-normal px-0 py-2 text-left font-bold"
);

function CandidateMeasure({
  measure,
  electionSlug,
}: {
  measure: CandidateFicheDetail["themes"][number]["measures"][number];
  electionSlug: string;
}) {
  const detailUrl = `/elections/${electionSlug}/mesures/${measure.slug}`;

  return (
    <li className="py-3.5 first:pt-0 last:pb-0">
      <p className="max-w-[70ch] text-[0.9375rem] leading-relaxed text-foreground">
        {measure.text}
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-x-5 gap-y-0">
        <Link
          href={detailUrl}
          prefetch={false}
          className={MEASURE_ACTION_CLASS_NAME}
          aria-label={`Voir la mesure : ${measure.text}`}
        >
          Voir la mesure
          <ArrowRight aria-hidden="true" />
        </Link>
        {measure.sourceUrl !== null && (
          <a
            href={measure.sourceUrl}
            target="_blank"
            rel="nofollow noopener noreferrer"
            className={MEASURE_ACTION_CLASS_NAME}
            aria-label={`Consulter la source externe de la mesure : ${measure.text}`}
          >
            Source externe
            <ExternalLink aria-hidden="true" />
          </a>
        )}
      </div>
    </li>
  );
}

export function CandidateThemes({
  themes,
  electionSlug,
  candidateSlug,
  measureCount,
  lastReviewedAt,
}: {
  themes: CandidateFicheDetail["themes"];
  electionSlug: string;
  candidateSlug: string;
  measureCount: number;
  lastReviewedAt: Date | null;
}) {
  if (themes.length === 0) return null;

  const programmeUrl = `/elections/${electionSlug}/candidats/${candidateSlug}/mesures`;
  const showAllMeasures = measureCount <= INLINE_PROGRAMME_MEASURE_LIMIT;

  return (
    <section aria-labelledby="mesures" className="space-y-4 rounded-xl border bg-card p-4 md:p-6">
      <div>
        <h2 id="mesures" className="font-display text-xl font-bold tracking-tight">
          Son programme, thème par thème
        </h2>
        {/* "Sa source" and not "le document dont elle est tirée": a measure may come from a
            speech, a debate, an interview or an article, which is why `programEditionId` is
            nullable. Naming a document would be the same over-promise as the filter that
            announced a documented programme on a bare measure count. */}
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {showAllMeasures
            ? `${measureCount} ${measureCount === 1 ? "mesure documentée" : "mesures documentées"}, avec leurs sources.`
            : `${measureCount} mesures documentées. Choisissez un thème ou explorez l’ensemble du programme avec les filtres.`}
        </p>
      </div>

      <ul className="divide-y divide-border">
        {themes.map((t) => {
          const singleMeasureUrl =
            t.measureCount === 1 && t.measures[0]
              ? `/elections/${electionSlug}/mesures/${t.measures[0].slug}`
              : null;
          return (
            <li key={t.theme} className="py-5 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <span
                  aria-hidden="true"
                  className={`h-5 w-1.5 shrink-0 rounded-full ${THEME_ACCENT_BAR[t.theme]}`}
                />
                <h3 className="text-base font-bold">{THEME_CATEGORY_LABELS[t.theme]}</h3>
                <span className="text-xs text-muted-foreground">
                  {t.measureCount} {t.measureCount === 1 ? "mesure" : "mesures"}
                </span>
              </div>

              {t.synthesis !== null && (
                <div className="mt-3 max-w-[75ch] space-y-1.5">
                  <div className="space-y-3">
                    {t.synthesis.claims.map((claim, index) => (
                      <div key={`${t.theme}-synthesis-${index}`}>
                        <p className="text-[0.9375rem] leading-relaxed text-foreground">
                          {claim.text}
                        </p>
                        <ul
                          aria-label={`Mesures qui étayent l’affirmation ${index + 1}`}
                          className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs"
                        >
                          {claim.measures.map((measure) => (
                            <li key={measure.id}>
                              <Link
                                href={`/elections/${electionSlug}/mesures/${measure.slug}`}
                                prefetch={false}
                                className="inline-flex min-h-11 items-center font-semibold underline underline-offset-2"
                                aria-label={`Voir la mesure et sa source : ${measure.text}`}
                              >
                                Voir la mesure et sa source
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Synthèse générée à partir des mesures documentées de cette candidature, puis
                    relue par Poligraph.
                  </p>
                </div>
              )}

              {showAllMeasures ? (
                <ul className="mt-3 divide-y divide-border/70 sm:pl-4">
                  {t.measures.map((measure) => (
                    <CandidateMeasure
                      key={measure.id}
                      measure={measure}
                      electionSlug={electionSlug}
                    />
                  ))}
                </ul>
              ) : (
                <div className="mt-3">
                  {t.subtopics.length > 0 && (
                    <ul
                      aria-label={`Sous-thèmes de ${THEME_CATEGORY_LABELS[t.theme]}`}
                      className="mb-3 flex flex-wrap gap-2"
                    >
                      {t.subtopics.map((subtopic) => (
                        <li key={subtopic.slug}>
                          <Link
                            href={`${programmeUrl}?theme=${t.slug}&sous-theme=${subtopic.slug}`}
                            prefetch={false}
                            className="inline-flex min-h-11 items-center rounded-full border border-border bg-muted/40 px-3 text-sm hover:border-primary hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            {subtopic.label}
                            <span className="ml-1 text-muted-foreground">{subtopic.count}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                  <Link
                    href={singleMeasureUrl ?? `${programmeUrl}?theme=${t.slug}`}
                    prefetch={false}
                    className={cn(
                      buttonVariants({ variant: "outline" }),
                      "min-h-11 w-full justify-between whitespace-normal px-4 text-left sm:w-auto"
                    )}
                  >
                    Voir {t.measureCount === 1 ? "cette mesure" : "ces mesures"}
                    <ArrowRight aria-hidden="true" />
                  </Link>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="border-t border-border pt-4 text-sm">
        <div className="flex flex-wrap items-center gap-x-5">
          <Link
            href={programmeUrl}
            prefetch={false}
            className={cn(
              buttonVariants({ variant: showAllMeasures ? "link" : "default" }),
              "min-h-11 whitespace-normal px-0 text-left font-bold",
              !showAllMeasures && "w-full px-4 sm:w-auto"
            )}
          >
            Explorer {measureCount === 1 ? "la mesure" : `les ${measureCount} mesures`}
            <ArrowRight aria-hidden="true" />
          </Link>
          <Link
            href={`/elections/${electionSlug}/comparer?candidat=${candidateSlug}`}
            prefetch={false}
            className={MEASURE_ACTION_CLASS_NAME}
          >
            Comparer avec une autre candidature
            <ArrowRight aria-hidden="true" />
          </Link>
        </div>
        {lastReviewedAt !== null && (
          <span className="text-muted-foreground">
            {" "}
            · dernière revue le {formatDate(lastReviewedAt)}
          </span>
        )}
      </div>
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
        Les thématiques les plus présentes dans son programme
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
        Compte le nombre de mesures que nous avons documentées par thème. Mesure ce dont la
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
export function CandidateTransparency({
  declarationCount,
  probityConvictionCount,
  probityNonDefinitiveConvictionCount,
  politicianSlug,
}: {
  declarationCount: number;
  probityConvictionCount: number;
  probityNonDefinitiveConvictionCount: number;
  politicianSlug: string;
}) {
  return (
    <section
      aria-labelledby="transparence-probite"
      className="space-y-3 rounded-xl border bg-card p-4 md:p-6"
    >
      <h2 id="transparence-probite" className="font-display text-xl font-bold tracking-tight">
        Transparence et probité
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
          <dt className="text-xs text-muted-foreground">Atteintes à la probité</dt>
          <dd className="text-sm font-bold">
            {probityConvictionCount === 0
              ? "Aucune condamnation documentée"
              : `${probityConvictionCount} ${probityConvictionCount === 1 ? "condamnation documentée" : "condamnations documentées"}`}
          </dd>
        </div>
      </dl>
      <p className="text-xs text-muted-foreground">
        Ce compteur ne retient que les condamnations prononcées au moins en première instance pour
        atteinte à la probité. Les autres procédures et leur statut exact figurent sur la fiche.
      </p>
      {probityNonDefinitiveConvictionCount > 0 && (
        <p className="text-xs text-muted-foreground-strong">
          Présomption d{"'"}innocence :{" "}
          {probityNonDefinitiveConvictionCount === 1
            ? "une condamnation comptée n'est pas définitive"
            : `${probityNonDefinitiveConvictionCount} condamnations comptées ne sont pas définitives`}
          .
        </p>
      )}
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
