import Link from "next/link";
import { THEME_ACCENT_BAR } from "@/config/labels";
import type { SubjectPageData } from "@/lib/data/subject-page";

/**
 * The thirteen subjects, alongside the one being read.
 *
 * A sticky rail at `lg` and above. Below it the same list folds into a disclosure, closed by
 * default: a rail would eat the width the comparison needs, and a horizontally scrolling chip row
 * makes the whole page drift sideways.
 *
 * The count is the currently-defended measures of each subject, so a reader can see where the
 * documentation actually is before clicking. A subject with none still appears: its emptiness is
 * information, and hiding it would make the corpus look more complete than it is.
 */

function ThemeLinks({
  themes,
  current,
}: {
  themes: SubjectPageData["siblingThemes"];
  current: SubjectPageData["theme"];
}) {
  return (
    <ul className="space-y-0.5">
      {themes.map((t) => {
        const isCurrent = t.theme === current;
        return (
          <li key={t.theme}>
            <Link
              href={`/elections/presidentielle-2027/themes/${t.slug}`}
              aria-current={isCurrent ? "page" : undefined}
              prefetch={false}
              className={`flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 transition-colors ${
                isCurrent ? "bg-muted font-bold" : "hover:bg-muted/60"
              }`}
            >
              <span
                aria-hidden="true"
                className={`h-6 w-1.5 shrink-0 rounded-full ${THEME_ACCENT_BAR[t.theme]}`}
              />
              <span className="min-w-0 flex-1 text-sm">{t.label}</span>
              {/* The number is meaningless without its unit for a screen reader, and repeating
                  "mesures" thirteen times on screen would be noise: the unit is spoken, not shown. */}
              <span className="shrink-0 text-xs text-muted-foreground">
                <span aria-hidden="true">{t.measureCount}</span>
                <span className="sr-only">
                  {t.measureCount} {t.measureCount === 1 ? "mesure" : "mesures"}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function SubjectSidebar({
  themes,
  current,
}: {
  themes: SubjectPageData["siblingThemes"];
  current: SubjectPageData["theme"];
}) {
  const currentLabel = themes.find((t) => t.theme === current)?.label ?? "";

  return (
    <div className="min-w-0">
      {/* Below lg: a disclosure. `<details>` rather than a state hook, so it stays a server
          component and the browser gives keyboard operation and announcement for free. */}
      <details className="rounded-xl border border-border bg-card lg:hidden">
        <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 px-4 text-sm font-bold">
          <span>
            Les thématiques{" "}
            <span className="font-normal text-muted-foreground">
              ({themes.length}) &middot; {currentLabel}
            </span>
          </span>
        </summary>
        <div className="border-t border-border p-2">
          <ThemeLinks themes={themes} current={current} />
        </div>
      </details>

      <nav aria-label="Les thématiques" className="hidden lg:sticky lg:top-20 lg:block">
        <p className="mb-2 px-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Les thématiques
        </p>
        <ThemeLinks themes={themes} current={current} />
      </nav>
    </div>
  );
}
