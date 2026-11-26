import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ProportionBar } from "@/components/stats/ProportionBar";
import {
  FACTCHECK_RATING_COLORS,
  FACTCHECK_RATING_LABELS,
  VERDICT_GROUP_COLORS,
  VERDICT_GROUP_LABELS,
} from "@/config/labels";
import type { VerdictGroup } from "@/lib/data/factcheck-context";
import {
  FACTCHECK_ABOUT_ANCHOR,
  VERDICT_GROUP_KEYS,
  groupByYear,
  verdictGroupOf,
  type PoliticianFactCheckItem,
  type PoliticianFactCheckLanding,
} from "@/lib/data/factcheck-politician";
import { formatDate } from "@/lib/utils";
import { VerdictFilter } from "./VerdictFilter";

/** Server components of /factchecks/politique/[slug]. Counts and links only. */

/** Rows of "à son sujet" shown before the fold: enough to read the page on a phone. */
export const ABOUT_PREVIEW_COUNT = 5;

/** Column headers of the outlet table: the full labels do not fit a phone-width table. */
const SHORT_VERDICT_LABELS: Record<VerdictGroup, string> = {
  vrai: "Vrai",
  trompeur: "Trompeur",
  faux: "Faux",
  inverifiable: "Invérif.",
};

const cardClass = "rounded-xl border bg-card p-5 mb-6 space-y-4";

function percent(value: number, total: number): string {
  return `${Math.round((value / total) * 100)} %`;
}

function plural(n: number, word: string): string {
  return `${n.toLocaleString("fr-FR")} ${word}${n > 1 ? "s" : ""}`;
}

export function VerdictSummary({ landing }: { landing: PoliticianFactCheckLanding }) {
  const { claimed, breakdown, bySource, firstYear } = landing;
  if (claimed.length === 0) return null;
  const total = claimed.length;

  return (
    <section aria-labelledby="fcp-bilan" className={cardClass}>
      <h2 id="fcp-bilan" className="text-lg font-display font-bold">
        Bilan par verdict
      </h2>
      <dl className="flex flex-wrap gap-x-8 gap-y-3">
        <div className="flex flex-col-reverse">
          <dt className="text-sm text-muted-foreground">
            déclaration{total > 1 ? "s" : ""} vérifiée{total > 1 ? "s" : ""}
          </dt>
          <dd className="font-display font-extrabold text-3xl tabular-nums">
            {total.toLocaleString("fr-FR")}
          </dd>
        </div>
        <div className="flex flex-col-reverse">
          <dt className="text-sm text-muted-foreground">
            rédaction{bySource.length > 1 ? "s" : ""}
          </dt>
          <dd className="font-display font-extrabold text-3xl tabular-nums">
            {bySource.length.toLocaleString("fr-FR")}
          </dd>
        </div>
        {firstYear && (
          <div className="flex flex-col-reverse">
            <dt className="text-sm text-muted-foreground">première vérification</dt>
            <dd className="font-display font-extrabold text-3xl tabular-nums">{firstYear}</dd>
          </div>
        )}
      </dl>
      <VerdictBreakdownBar breakdown={breakdown} total={total} />
    </section>
  );
}

/**
 * The proportion bar and its legend, shared by the landing's summary and the candidate fiche, so
 * the two pages can never show the same record in two shapes.
 */
export function VerdictBreakdownBar({
  breakdown,
  total,
}: {
  breakdown: PoliticianFactCheckLanding["breakdown"];
  total: number;
}) {
  return (
    <div className="space-y-3">
      <ProportionBar breakdown={breakdown} />
      <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
        {VERDICT_GROUP_KEYS.filter((g) => breakdown[g] > 0).map((group) => (
          <li key={group} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="h-2 w-2 rounded-full shrink-0"
              style={{ backgroundColor: VERDICT_GROUP_COLORS[group] }}
            />
            <span className="text-muted-foreground">{VERDICT_GROUP_LABELS[group]}</span>
            <span className="font-bold tabular-nums">{breakdown[group]}</span>
            <span className="text-muted-foreground">({percent(breakdown[group], total)})</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SourceTable({ landing }: { landing: PoliticianFactCheckLanding }) {
  if (landing.bySource.length === 0) return null;
  return (
    <section aria-labelledby="fcp-sources" className={cardClass}>
      <h2 id="fcp-sources" className="text-lg font-display font-bold">
        Par rédaction
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th scope="col" className="text-left font-medium py-2 pr-3">
                Rédaction
              </th>
              {VERDICT_GROUP_KEYS.map((group) => (
                <th key={group} scope="col" className="text-right font-medium py-2 px-2">
                  <span aria-hidden="true">{SHORT_VERDICT_LABELS[group]}</span>
                  <span className="sr-only">{VERDICT_GROUP_LABELS[group]}</span>
                </th>
              ))}
              <th scope="col" className="text-right font-medium py-2 pl-2">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {landing.bySource.map((row) => (
              <tr key={row.name} className="border-b last:border-0">
                <th scope="row" className="text-left font-semibold py-2 pr-3">
                  {row.name}
                </th>
                {VERDICT_GROUP_KEYS.map((group) => (
                  <td key={group} className="text-right tabular-nums py-2 px-2">
                    {row[group]}
                  </td>
                ))}
                <td className="text-right tabular-nums font-bold py-2 pl-2">{row.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function FactCheckRow({
  item,
  verdict,
  compact = false,
}: {
  item: PoliticianFactCheckItem;
  verdict?: VerdictGroup | null;
  /** Title only: a rumour's title already states it, the quote would double the row on a phone. */
  compact?: boolean;
}) {
  return (
    <li data-verdict={verdict ?? undefined}>
      <Link
        prefetch={false}
        href={`/factchecks/${item.slug}`}
        className="flex flex-col gap-1 py-3 min-h-11 group"
      >
        <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
          <Badge className={FACTCHECK_RATING_COLORS[item.verdictRating]}>
            {FACTCHECK_RATING_LABELS[item.verdictRating]}
          </Badge>
          <span>{item.source}</span>
          <span>{formatDate(item.publishedAt)}</span>
        </span>
        <span className="font-medium group-hover:underline">{item.title}</span>
        {!compact && (
          <span className="text-sm text-muted-foreground italic">
            &laquo;&nbsp;{item.claimText}&nbsp;&raquo;
          </span>
        )}
      </Link>
    </li>
  );
}

export function FactCheckList({ landing }: { landing: PoliticianFactCheckLanding }) {
  const { author, claimed, breakdown } = landing;

  return (
    <section aria-labelledby="fcp-list" className={cardClass}>
      <h2 id="fcp-list" className="text-lg font-display font-bold">
        Toutes ses déclarations vérifiées
      </h2>
      {claimed.length === 0 ? (
        <p className="text-muted-foreground">
          Aucune déclaration attribuée à {author.fullName} n{"'"}a été vérifiée par les rédactions
          suivies par Poligraph.
        </p>
      ) : (
        <VerdictFilter
          total={claimed.length}
          counts={VERDICT_GROUP_KEYS.filter((g) => breakdown[g] > 0).map((group) => ({
            group,
            count: breakdown[group],
          }))}
        >
          {groupByYear(claimed).map(({ year, items }) => (
            <div key={year} data-year={year}>
              <h3 className="text-sm font-semibold text-muted-foreground border-b pb-1 mt-4">
                {year}
              </h3>
              <ul className="divide-y">
                {items.map((item) => (
                  <FactCheckRow
                    key={item.slug}
                    item={item}
                    verdict={verdictGroupOf(item.verdictRating)}
                  />
                ))}
              </ul>
            </div>
          ))}
        </VerdictFilter>
      )}
    </section>
  );
}

/**
 * Fact-checks about the person that they did not author: rumours, or someone else's claim naming
 * them. Placed after their own claims, at the bottom of the page, so it never pushes their record
 * down on a phone. One line of counts, the five most recent rows, the rest folded in a <details>
 * that also holds the verdict filter. Opening it hides the preview (CSS :has), so no row shows
 * twice; without :has support the preview simply stays above.
 *
 * The verdicts are counted apart from the person's record: a rumour about someone says nothing of
 * their own reliability, and the caveat says so before the list.
 */
export function AboutSection({ landing }: { landing: PoliticianFactCheckLanding }) {
  const { author, about, aboutBreakdown, aboutPending } = landing;
  if (about.length === 0 && aboutPending.length === 0) return null;
  const total = about.length;
  const folded = total > ABOUT_PREVIEW_COUNT;
  const counts = VERDICT_GROUP_KEYS.filter((g) => aboutBreakdown[g] > 0).map((group) => ({
    group,
    count: aboutBreakdown[group],
  }));

  return (
    <section
      id={FACTCHECK_ABOUT_ANCHOR}
      aria-labelledby="fcp-about"
      className={`${cardClass} group/about scroll-mt-20`}
    >
      <h2 id="fcp-about" className="text-lg font-display font-bold">
        Vérifications à son sujet
        {total > 0 && (
          <span className="font-normal text-muted-foreground tabular-nums"> ({total})</span>
        )}
      </h2>
      <p className="text-sm text-muted-foreground">
        Des propos tenus par d{"'"}autres au sujet de {author.fullName} : rumeurs, intox,
        déclarations de tiers. Ils ne comptent pas dans le bilan de ses déclarations.
      </p>
      {total > 0 && (
        <>
          <VerdictCountLine counts={counts} />
          {folded ? (
            <>
              <ul className="divide-y group-has-[details[open]]/about:hidden">
                {about.slice(0, ABOUT_PREVIEW_COUNT).map((item) => (
                  <FactCheckRow key={item.slug} item={item} compact />
                ))}
              </ul>
              <details className="rounded-lg border p-3">
                <summary className="cursor-pointer min-h-11 flex items-center font-medium">
                  Voir les {plural(total, "vérification")} et filtrer par verdict
                </summary>
                <div className="mt-3">
                  <VerdictFilter total={total} counts={counts} noun="vérification">
                    <AboutByYear items={about} />
                  </VerdictFilter>
                </div>
              </details>
            </>
          ) : (
            <ul className="divide-y">
              {about.map((item) => (
                <FactCheckRow key={item.slug} item={item} compact />
              ))}
            </ul>
          )}
        </>
      )}
      {aboutPending.length > 0 && (
        <details className="rounded-lg border border-dashed p-3">
          <summary className="cursor-pointer min-h-11 flex items-center text-sm font-medium">
            Rattachement à confirmer ({plural(aboutPending.length, "fact-check")})
          </summary>
          <p className="text-sm text-muted-foreground mt-2">
            Ces vérifications citent le nom de famille seul. Tant que l{"'"}équipe n{"'"}a pas
            confirmé qu{"'"}il s{"'"}agit bien de {author.fullName}, elles ne sont pas comptées.
          </p>
          <ul className="divide-y">
            {aboutPending.map((item) => (
              <FactCheckRow key={item.slug} item={item} compact />
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

/** Verdict counts on one line: short labels, the total sits in the heading, so four groups hold on a 390 px screen. */
function VerdictCountLine({ counts }: { counts: { group: VerdictGroup; count: number }[] }) {
  return (
    <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
      {counts.map(({ group, count }) => (
        <span key={group} className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <span
            aria-hidden="true"
            className="h-2 w-2 rounded-full shrink-0"
            style={{ backgroundColor: VERDICT_GROUP_COLORS[group] }}
          />
          <span className="text-muted-foreground">
            <span aria-hidden="true">{SHORT_VERDICT_LABELS[group]}</span>
            <span className="sr-only">{VERDICT_GROUP_LABELS[group]}</span>
          </span>
          <b className="tabular-nums">{count}</b>
        </span>
      ))}
    </p>
  );
}

function AboutByYear({ items }: { items: PoliticianFactCheckItem[] }) {
  return groupByYear(items).map(({ year, items: rows }) => (
    <div key={year} data-year={year}>
      <h3 className="text-sm font-semibold text-muted-foreground border-b pb-1 mt-4">{year}</h3>
      <ul className="divide-y">
        {rows.map((item) => (
          <FactCheckRow
            key={item.slug}
            item={item}
            verdict={verdictGroupOf(item.verdictRating)}
            compact
          />
        ))}
      </ul>
    </div>
  ));
}
