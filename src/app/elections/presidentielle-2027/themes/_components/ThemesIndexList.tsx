import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { THEME_ACCENT_BAR } from "@/config/labels";
import type { ThemesIndexData } from "@/lib/data/themes-index";
import { formatDate } from "@/lib/utils";

interface ThemesIndexListProps {
  data: ThemesIndexData;
}

function ReviewDate({ value }: { value: Date | null }) {
  return value === null ? (
    <span className="text-muted-foreground">Aucune revue publiée</span>
  ) : (
    <time dateTime={value.toISOString()}>{formatDate(value)}</time>
  );
}

function SubjectLink({
  slug,
  theme,
  label,
}: Pick<ThemesIndexData["themes"][number], "slug" | "theme" | "label">) {
  return (
    <Link
      href={`/elections/presidentielle-2027/themes/${slug}`}
      prefetch={false}
      className="flex min-h-11 items-center gap-3 rounded-lg font-medium hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <span
        aria-hidden="true"
        className={`h-6 w-1 shrink-0 rounded-full ${THEME_ACCENT_BAR[theme]}`}
      />
      <span className="min-w-0 flex-1">{label}</span>
      <ChevronRight
        aria-hidden="true"
        className="h-4 w-4 shrink-0 text-muted-foreground md:hidden"
      />
    </Link>
  );
}

export function ThemesIndexList({ data }: ThemesIndexListProps) {
  const hasWithdrawnMeasures = data.themes.some(
    (entry) => entry.documentedMeasureCount > entry.currentlyDefendedMeasureCount
  );

  return (
    <>
      <ul className="space-y-3 md:hidden">
        {data.themes.map((entry) => (
          <li key={entry.theme} className="rounded-2xl border border-border bg-card p-4">
            <SubjectLink slug={entry.slug} theme={entry.theme} label={entry.label} />
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border pt-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Candidats avec des mesures</dt>
                <dd className="mt-0.5 font-display text-xl font-bold tabular-nums">
                  {entry.documentedCandidacyCount}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Mesures publiées</dt>
                <dd className="mt-0.5">
                  <span className="block font-display text-xl font-bold tabular-nums">
                    {entry.currentlyDefendedMeasureCount}
                  </span>
                </dd>
              </div>
              {hasWithdrawnMeasures && (
                <div>
                  <dt className="text-xs text-muted-foreground">Mesures retirées</dt>
                  <dd className="mt-0.5 font-display text-xl font-bold tabular-nums">
                    {entry.documentedMeasureCount - entry.currentlyDefendedMeasureCount}
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-xs text-muted-foreground">Dernière revue éditoriale</dt>
                <dd className="mt-1 text-xs">
                  <ReviewDate value={entry.lastReviewedAt} />
                </dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">
            Mesures publiées par thème pour la présidentielle 2027
          </caption>
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground-strong">
              <th scope="col" className="py-2 pr-3 text-left font-bold">
                Thème
              </th>
              <th scope="col" className="px-3 py-2 text-right font-bold">
                Candidats avec des mesures
              </th>
              <th scope="col" className="px-3 py-2 text-right font-bold">
                Mesures publiées
              </th>
              {hasWithdrawnMeasures && (
                <th scope="col" className="px-3 py-2 text-right font-bold">
                  Mesures retirées
                </th>
              )}
              <th scope="col" className="py-2 pl-3 text-left font-bold">
                Dernière revue
              </th>
            </tr>
          </thead>
          <tbody>
            {data.themes.map((entry) => (
              <tr key={entry.theme} className="border-b border-border last:border-b-0">
                <th scope="row" className="py-1 pr-3 text-left font-normal">
                  <SubjectLink slug={entry.slug} theme={entry.theme} label={entry.label} />
                </th>
                <td className="px-3 py-3 text-right tabular-nums">
                  {entry.documentedCandidacyCount}
                </td>
                <td className="px-3 py-3 text-right tabular-nums">
                  {entry.currentlyDefendedMeasureCount}
                </td>
                {hasWithdrawnMeasures && (
                  <td className="px-3 py-3 text-right tabular-nums">
                    {entry.documentedMeasureCount - entry.currentlyDefendedMeasureCount}
                  </td>
                )}
                <td className="py-3 pl-3 text-muted-foreground">
                  <ReviewDate value={entry.lastReviewedAt} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
