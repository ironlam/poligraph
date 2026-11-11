import Link from "next/link";
import { ArrowRight, ExternalLink } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { CANDIDACY_STATUS_LABELS, THEME_CATEGORY_LABELS } from "@/config/labels";
import type { PartyPresidentialProgramme } from "@/lib/data/party-presidentielle";
import { PRESIDENTIELLE_2027_SLUG, themeToSlug } from "@/lib/presidentielle/themes";
import { cn, formatDate } from "@/lib/utils";

const HUB_PATH = `/elections/${PRESIDENTIELLE_2027_SLUG}`;

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count.toLocaleString("fr-FR")} ${count > 1 ? pluralForm : singular}`;
}

type Props = {
  partyName: string;
  partySlug: string;
  programme: PartyPresidentialProgramme;
  /** `summary` on the party page, `full` on the programme page (adds themes and documents). */
  variant: "summary" | "full";
};

export function PartyPresidentialSection({ partyName, partySlug, programme, variant }: Props) {
  const { candidacies, themes, measureCount, editions } = programme;
  const withMeasures = candidacies.filter((c) => c.ficheOpen && c.measureCount > 0);
  // A theme row can only point somewhere when a single fiche carries the party's measures.
  const themeTarget = withMeasures.length === 1 ? withMeasures[0] : undefined;
  const maxThemeCount = Math.max(1, ...themes.map((t) => t.measureCount));
  const headingId = `presidentielle-2027-${variant}`;

  return (
    <section
      aria-labelledby={headingId}
      className="space-y-5 rounded-2xl border bg-card p-5 sm:p-6"
    >
      <div className="max-w-3xl space-y-2">
        <p className="text-xs font-bold uppercase tracking-widest text-brand-on-surface">
          Élection présidentielle 2027
        </p>
        <h2 id={headingId} className="font-display text-2xl font-bold tracking-tight">
          {variant === "full" ? "Mesures pour la présidentielle 2027" : "Présidentielle 2027"}
        </h2>
        <p className="leading-relaxed text-muted-foreground">
          {measureCount > 0
            ? `Poligraph a publié ${plural(measureCount, "mesure", "mesures")} pour les candidatures rattachées à ${partyName}. Chacune renvoie à sa source.`
            : `Aucune mesure n'est publiée à ce jour pour les candidatures rattachées à ${partyName}.`}
        </p>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2">
        {candidacies.map((candidacy) => (
          <li key={candidacy.candidacyId} className="rounded-xl border bg-background p-4">
            <p className="font-display text-lg font-bold">
              {candidacy.ficheOpen ? (
                <Link
                  href={`${HUB_PATH}/candidats/${candidacy.politicianSlug}`}
                  className="inline-flex min-h-11 items-center text-primary underline-offset-4 hover:underline"
                  prefetch={false}
                >
                  {candidacy.candidateName}
                </Link>
              ) : (
                candidacy.candidateName
              )}
            </p>
            <p className="text-sm text-muted-foreground">
              {CANDIDACY_STATUS_LABELS[candidacy.status]}
            </p>
            <p className="mt-2 text-sm">
              {candidacy.measureCount > 0
                ? `${plural(candidacy.measureCount, "mesure publiée", "mesures publiées")}${
                    candidacy.partyProgramMeasureCount > 0
                      ? `, dont ${candidacy.partyProgramMeasureCount.toLocaleString("fr-FR")} tirées du programme du parti`
                      : ""
                  }`
                : "Aucune mesure publiée à ce jour"}
            </p>
          </li>
        ))}
      </ul>

      {variant === "full" && themes.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-display text-lg font-bold">Mesures par thème</h3>
          <p className="text-sm text-muted-foreground">
            Nombre de mesures publiées dans chaque thème. Ce décompte décrit le contenu du
            programme, il ne dit rien de l&apos;importance que le parti accorde à un sujet.
          </p>
          <ul className="max-w-3xl space-y-1">
            {themes.map(({ theme, measureCount: count }) => {
              const label = THEME_CATEGORY_LABELS[theme];
              const row = (
                <>
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="font-medium">{label}</span>
                    <span className="shrink-0 whitespace-nowrap tabular-nums text-sm text-muted-foreground">
                      {plural(count, "mesure", "mesures")}
                    </span>
                  </span>
                  <span className="mt-1 block h-2 rounded-full bg-muted" aria-hidden="true">
                    <span
                      className="block h-2 rounded-full bg-primary"
                      style={{ width: `${Math.max(2, (count / maxThemeCount) * 100)}%` }}
                    />
                  </span>
                </>
              );
              return (
                <li key={theme}>
                  {themeTarget ? (
                    <Link
                      href={`${HUB_PATH}/candidats/${themeTarget.politicianSlug}/mesures?theme=${themeToSlug(theme)}`}
                      className="block min-h-11 rounded-lg px-2 py-2 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      prefetch={false}
                    >
                      {row}
                    </Link>
                  ) : (
                    <div className="px-2 py-2">{row}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {variant === "full" && editions.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-display text-lg font-bold">Documents du programme</h3>
          <ul className="space-y-1">
            {editions.map((edition) => (
              <li key={edition.id}>
                <a
                  href={edition.documentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center gap-1.5 text-primary underline-offset-4 hover:underline"
                >
                  {edition.label}
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span className="sr-only">(ouvre dans un nouvel onglet)</span>
                </a>
                <span className="block text-sm text-muted-foreground">
                  Publié le {formatDate(edition.publishedAt)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
        {variant === "summary" && measureCount > 0 && (
          <Link
            href={`/partis/${partySlug}/programme`}
            className={cn(buttonVariants({ variant: "default" }), "min-h-11")}
            prefetch={false}
          >
            Voir les mesures par thème
            <ArrowRight aria-hidden="true" />
          </Link>
        )}
        <Link
          href={`${HUB_PATH}/candidats`}
          className={cn(buttonVariants({ variant: "link" }), "min-h-11 px-0")}
          prefetch={false}
        >
          Tous les candidats à la présidentielle 2027
        </Link>
      </div>
    </section>
  );
}
