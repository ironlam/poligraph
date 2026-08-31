import {
  MEASURE_SOURCE_KIND_LABELS,
  SOURCE_TIER_LABELS,
  VISIBILITY_BLOCKER_LABELS,
} from "@/config/labels";
import type { PublicMeasure } from "@/lib/data/measures";
import type { ModerationState } from "@/lib/measures/moderation-state";
import { MarkdownText } from "@/components/ui/markdown";

/**
 * What the public actually gets for this measure.
 *
 * `publicMeasure` is the real output of `getPublicMeasure()`, not a second derivation: the
 * moderation screen shows the public function's answer, which is the strongest form of the
 * separation between the two reads. When it is null, the blocker list says why, condition by
 * condition.
 */
export function PublicVisibilityCard({
  state,
  publicMeasure,
}: {
  state: ModerationState;
  publicMeasure: PublicMeasure | null;
}) {
  const dateFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" });

  return (
    <section
      aria-labelledby="public-visibility-heading"
      className="rounded-lg border border-border p-4"
    >
      <h2 id="public-visibility-heading" className="text-base font-semibold">
        Ce que le public voit
      </h2>

      {publicMeasure === null ? (
        <div className="mt-3 space-y-3">
          <p className="text-sm font-medium">
            Cette mesure ne sort d&apos;aucune lecture publique.
          </p>
          <ul className="space-y-1.5 text-sm text-muted-foreground">
            {state.visibilityBlockers.map((blocker) => (
              <li key={blocker} className="flex gap-2">
                <span aria-hidden="true">·</span>
                <span>{VISIBILITY_BLOCKER_LABELS[blocker]}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="mt-3 space-y-4">
          <blockquote className="border-l-2 border-border pl-3 text-sm">
            {publicMeasure.text}
          </blockquote>

          {publicMeasure.details !== null && (
            <div>
              <h3 className="text-sm font-medium">Contexte publié</h3>
              <MarkdownText className="mt-2 text-sm leading-relaxed text-foreground">
                {publicMeasure.details}
              </MarkdownText>
            </div>
          )}

          {publicMeasure.readerGuides.length > 0 && (
            <div>
              <h3 className="text-sm font-medium">Repères publiés</h3>
              <ul className="mt-2 space-y-2">
                {publicMeasure.readerGuides.map((guide) => (
                  <li key={guide.slug} className="rounded border border-border p-3 text-sm">
                    <p className="font-bold">{guide.label}</p>
                    <p className="mt-1 leading-relaxed">{guide.definition}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {publicMeasure.withdrawal !== null && (
            <div className="rounded border border-border bg-muted/40 p-3 text-sm">
              <p className="font-medium">
                Retirée le {dateFormat.format(publicMeasure.withdrawal.withdrawnAt)}
              </p>
              {publicMeasure.withdrawal.sourceUrl && publicMeasure.withdrawal.sourceLabel ? (
                <a
                  href={publicMeasure.withdrawal.sourceUrl}
                  className="mt-1 inline-block text-primary underline"
                  rel="noreferrer"
                  target="_blank"
                >
                  {publicMeasure.withdrawal.sourceLabel}
                </a>
              ) : (
                // The withdrawal is shown either way. Hiding it to protect the missing source
                // would state something false: that the candidate still defends the measure.
                <p className="mt-1 text-red-700 dark:text-red-400">
                  Retrait incomplet : la source n&apos;est pas renseignée, donc aucun lien
                  n&apos;est affiché au public.
                </p>
              )}
            </div>
          )}

          <div>
            <h3 className="text-sm font-medium">
              {publicMeasure.sources.length === 1
                ? "1 source citée"
                : `${publicMeasure.sources.length} sources citées`}
            </h3>
            <ul className="mt-2 space-y-1.5 text-sm">
              {publicMeasure.sources.map((source) => (
                <li key={source.id}>
                  <a
                    href={source.url}
                    className="text-primary underline break-all"
                    rel="noreferrer"
                    target="_blank"
                  >
                    {MEASURE_SOURCE_KIND_LABELS[source.sourceKind]}
                  </a>
                  <span className="text-muted-foreground">
                    {" "}
                    · {SOURCE_TIER_LABELS[source.tier]} · {dateFormat.format(source.publishedAt)}
                    {source.page !== null && ` · p. ${source.page}`}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
