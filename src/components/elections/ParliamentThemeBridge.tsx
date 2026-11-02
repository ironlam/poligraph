import Link from "next/link";
import { ArrowRight, Landmark } from "lucide-react";
import { DOSSIER_STATUS_LABELS, THEME_CATEGORY_LABELS } from "@/config/labels";
import type { ParliamentThemeTarget } from "@/lib/presidentielle/parliament-bridge";
import type { ParliamentThemeSnapshot } from "@/lib/data/parliament-bridge";
import { themeToSlug } from "@/lib/theme-utils";
import { formatDate } from "@/lib/utils";

interface ParliamentThemeBridgeProps {
  /** Page the bridge sits on, kept in the analytics event to compare placements. */
  source: "theme" | "mesure";
  target: ParliamentThemeTarget;
  snapshot: ParliamentThemeSnapshot;
  /** The dossiers section is behind a feature flag: without it, no link may point there. */
  dossiersEnabled: boolean;
}

const LINK_CLASS =
  "inline-flex min-h-11 items-center gap-2 font-bold text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

/**
 * Door from a presidential subject to the permanent parliamentary sections.
 *
 * The link is thematic only: Poligraph files dossiers and scrutins under a theme automatically,
 * and nothing here says a measure was or will be voted. That sentence stays on screen, it is what
 * keeps a proximity from reading as a verified match.
 */
export function ParliamentThemeBridge({
  source,
  target,
  snapshot,
  dossiersEnabled,
}: ParliamentThemeBridgeProps) {
  const showDossiers = dossiersEnabled && snapshot.dossierCount > 0;
  const showVotes = snapshot.scrutinCount > 0;
  if (!showDossiers && !showVotes) return null;

  const label = THEME_CATEGORY_LABELS[target.theme];
  const slug = themeToSlug(target.theme);
  const event = (name: string) => ({
    "data-umami-event": "pres_bridge_click",
    "data-umami-event-source": source,
    "data-umami-event-target": name,
    "data-umami-event-theme": target.theme,
  });

  return (
    <section aria-labelledby="au-parlement" className="rounded-xl border border-border bg-card p-5">
      <h2
        id="au-parlement"
        className="flex items-center gap-2 font-display text-xl font-extrabold tracking-tight"
      >
        <Landmark aria-hidden="true" className="h-5 w-5 text-primary" />
        Au Parlement, sur le thème «&nbsp;{label}&nbsp;»
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Poligraph classe automatiquement les textes de loi et les scrutins par thème.
        {target.scope === "broader" &&
          " Cette catégorie est plus large que le sujet de cette page : elle regroupe aussi d'autres questions sociales."}{" "}
        Ces textes ne correspondent pas forcément à une mesure de candidat : aucun rapprochement
        entre un programme et un texte voté n&apos;est établi ici.
      </p>

      {showDossiers && snapshot.latestDossiers.length > 0 && (
        <ul className="mt-4 divide-y divide-border">
          {snapshot.latestDossiers.map((d) => (
            <li key={d.slug}>
              <Link
                href={`/parlement/dossiers/${d.slug}`}
                prefetch={false}
                {...event("dossier")}
                className="block min-h-11 py-3 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <span className="font-bold">{d.shortTitle ?? d.title}</span>
                <span className="mt-1 block text-sm text-muted-foreground">
                  {DOSSIER_STATUS_LABELS[d.status]}
                  {d.filingDate ? `, déposé le ${formatDate(d.filingDate)}` : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:gap-x-6">
        {showDossiers && (
          <Link
            href={`/parlement/dossiers?theme=${target.theme}`}
            prefetch={false}
            {...event("dossiers_liste")}
            className={LINK_CLASS}
          >
            {`Voir les ${snapshot.dossierCount.toLocaleString("fr-FR")} dossiers législatifs`}
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        )}
        {showVotes && (
          <Link
            href={`/parlement/votes/themes/${slug}`}
            prefetch={false}
            {...event("votes_theme")}
            className={LINK_CLASS}
          >
            {`Voir les ${snapshot.scrutinCount.toLocaleString("fr-FR")} scrutins`}
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        )}
      </div>
    </section>
  );
}
