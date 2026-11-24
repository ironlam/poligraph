import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PoliticianAvatar } from "@/components/politicians/PoliticianAvatar";
import { THEME_ACCENT_BAR } from "@/config/labels";
import type { HubLatestMeasure, HubLatestUpdate } from "@/lib/data/hub";
import { formatDate } from "@/lib/utils";

const BASE_PATH = "/elections/presidentielle-2027";

function sourceLine(source: HubLatestMeasure["source"]): string | null {
  if (source === null) return null;
  if (source.host === null) return source.kindLabel;
  return `${source.kindLabel}, ${source.host}`;
}

const ROW =
  "grid grid-cols-[2.5rem_minmax(0,1fr)] gap-3 px-4 py-4 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-reduce:transition-none";
const META = "flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground-strong";
const PILL =
  "inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 font-semibold text-foreground";

/**
 * The hub's "what changed" block: the last measures that passed review and the last changes of
 * candidacy status (announced, official, ended), newest first, at most one row per candidacy so
 * no candidate fills it alone. Rendered on the server from a tagged cache,
 * so a publication refreshes it without a timer or client JS.
 *
 * Absent rather than empty: with nothing published yet, the corpus state further down already
 * says so.
 */
export function HubLatestUpdates({
  updates,
  lastReviewedAt,
}: {
  updates: HubLatestUpdate[];
  lastReviewedAt: Date | null;
}) {
  if (updates.length === 0) return null;

  return (
    <section aria-labelledby="hub-latest-title" className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2
          id="hub-latest-title"
          className="flex items-center gap-2.5 font-display text-xl font-bold tracking-tight md:text-2xl"
        >
          <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full bg-brand" />
          Dernières mises à jour
        </h2>
        {lastReviewedAt !== null && (
          <p className="text-xs text-muted-foreground-strong">
            Dernière revue éditoriale le {formatDate(lastReviewedAt)}
          </p>
        )}
      </div>

      <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
        {updates.map((update) => {
          const avatar = (
            <span aria-hidden="true">
              <PoliticianAvatar
                photoUrl={update.photoUrl}
                blobPhotoUrl={update.blobPhotoUrl}
                fullName={update.candidateName}
                size="sm"
                fixedPx={40}
              />
            </span>
          );
          if (update.kind === "status") {
            return (
              <li key={`statut-${update.candidacyId}`}>
                <Link
                  href={`${BASE_PATH}/candidats/${update.politicianSlug}`}
                  prefetch={false}
                  className={ROW}
                >
                  {avatar}
                  <span className="min-w-0 space-y-1.5">
                    <span className={META}>
                      <span className="font-bold text-primary">{update.candidateName}</span>
                      <span className={PILL}>Statut de la candidature</span>
                      <span>mis à jour le {formatDate(update.changedAt)}</span>
                    </span>
                    <span className="block font-semibold leading-snug">{update.statusLabel}</span>
                    <span className="line-clamp-2 block text-xs text-muted-foreground">
                      Source : {update.sourceLabel}
                      {update.sourceHost !== null && ` (${update.sourceHost})`}
                    </span>
                  </span>
                </Link>
              </li>
            );
          }
          const source = sourceLine(update.source);
          return (
            <li key={update.slug}>
              <Link href={`${BASE_PATH}/mesures/${update.slug}`} prefetch={false} className={ROW}>
                {avatar}
                <span className="min-w-0 space-y-1.5">
                  <span className={META}>
                    <span className="font-bold text-primary">{update.candidateName}</span>
                    <span className={PILL}>
                      <span
                        aria-hidden="true"
                        className={`h-2 w-2 rounded-full ${THEME_ACCENT_BAR[update.theme]}`}
                      />
                      {update.themeLabel}
                    </span>
                    <span>publiée le {formatDate(update.publishedAt)}</span>
                  </span>
                  <span className="line-clamp-3 block font-semibold leading-snug">
                    {update.text}
                  </span>
                  {source !== null && (
                    <span className="block text-xs text-muted-foreground">Source : {source}</span>
                  )}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      <Link
        href={`${BASE_PATH}/themes`}
        prefetch={false}
        className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        Parcourir toutes les mesures par thème
        <ArrowRight aria-hidden="true" className="h-4 w-4" />
      </Link>
    </section>
  );
}
