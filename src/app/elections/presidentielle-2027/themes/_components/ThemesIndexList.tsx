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
    </Link>
  );
}

function plural(count: number, singular: string): string {
  return `${count} ${singular}${count > 1 ? "s" : ""}`;
}

/** "17 candidats · 260 mesures", with the reason a theme page is not open yet when it is not. */
function coverageLine(entry: ThemesIndexData["themes"][number]): string {
  if (entry.currentlyDefendedMeasureCount === 0) return "Aucune mesure publiée";
  const counts = `${plural(entry.documentedCandidacyCount, "candidat")} · ${plural(entry.currentlyDefendedMeasureCount, "mesure")}`;
  return entry.publishable ? counts : `${counts} · pas encore comparable`;
}

export function ThemesIndexList({ data }: ThemesIndexListProps) {
  const hasWithdrawnMeasures = data.themes.some(
    (entry) => entry.documentedMeasureCount > entry.currentlyDefendedMeasureCount
  );

  return (
    <>
      {/* One 52px row per theme: a phone screen then lists nine of them instead of one card. The
          withdrawn count and the review date stay in the table from md up and on the theme page. */}
      <ul className="divide-y divide-border rounded-2xl border border-border bg-card md:hidden">
        {data.themes.map((entry) => (
          <li key={entry.theme}>
            <Link
              href={`/elections/presidentielle-2027/themes/${entry.slug}`}
              prefetch={false}
              className="flex min-h-[52px] items-center gap-3 px-3 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              <span
                aria-hidden="true"
                className={`h-7 w-1 shrink-0 rounded-full ${THEME_ACCENT_BAR[entry.theme]}`}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold leading-tight">{entry.label}</span>
                <span className="mt-0.5 block text-xs tabular-nums text-muted-foreground">
                  {coverageLine(entry)}
                </span>
              </span>
              <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
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
