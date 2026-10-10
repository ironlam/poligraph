import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Users } from "lucide-react";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Button } from "@/components/ui/button";
import { MissingData } from "@/components/ui/MissingData";
import { CoverageSummary } from "@/components/governments/CoverageSummary";
import { GovernmentBadges } from "@/components/governments/GovernmentBadges";
import { PolitiquesLocalNav } from "@/components/governments/PolitiquesLocalNav";
import {
  formatDay,
  governmentDatesLine,
  isPartial,
  participantsLabel,
  plural,
} from "@/components/governments/format";
import { groupVisible } from "@/components/governments/view";
import { getGovernmentEpisodes, getPublishedGovernments } from "@/lib/data/governments";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { compositionAt } from "@/lib/governments/composition";
import type { PublishedGovernment } from "@/lib/governments/mapping";
import { membersCoverage } from "@/lib/governments/members";
import { MAX_QUERY_LENGTH } from "@/lib/governments/params";
import { normalizeText } from "@/lib/name-matching";

const PATH = "/politiques/gouvernements";

type SearchParams = Record<string, string | string[] | undefined>;

interface PageProps {
  searchParams: Promise<SearchParams>;
}

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const sp = await searchParams;
  const filtered = Object.keys(sp).length > 0;
  return {
    title: "Gouvernements de la Ve République",
    description:
      "Composition de chaque gouvernement publié, date par date : qui a exercé quelle fonction, avec la source officielle de chaque nomination.",
    alternates: { canonical: PATH },
    ...(filtered ? { robots: { index: false, follow: true } } : {}),
  };
}

function teamYear(g: { formedAt: string | null; primeMinisterAppointedAt: string }): string {
  return (g.formedAt ?? g.primeMinisterAppointedAt).slice(0, 4);
}

/**
 * Complement for the government in office: people present in an established way at the date
 * the composition is documented to. Hidden people are left out, hence « au moins » when any.
 */
function presentLine(
  g: PublishedGovernment,
  data: Awaited<ReturnType<typeof getGovernmentEpisodes>>
): string | null {
  if (g.endedAt || !g.compositionVerifiedAt) return null;
  const result = compositionAt(g, data.episodes, g.compositionVerifiedAt);
  if (result.status !== "ok") return null;
  const byId = new Map(data.episodes.map((e) => [e.membershipId, e]));
  const n = groupVisible(
    [...result.byCategory.established, ...result.byCategory.currentAffairs],
    byId,
    data.people
  ).length;
  const count = plural(n, "présente", "présentes");
  return `dont ${isPartial(g) ? `au moins ${count}` : count} de façon établie au ${formatDay(result.date)}`;
}

export default async function GouvernementsPage({ searchParams }: PageProps) {
  if (!(await isFeatureEnabled("gouvernements"))) notFound();

  const sp = await searchParams;
  const [govs, data] = await Promise.all([getPublishedGovernments(), getGovernmentEpisodes()]);

  const q = first(sp.q).trim().slice(0, MAX_QUERY_LENGTH);
  const years = [...new Set(govs.map(teamYear))].sort().reverse();
  const annee = years.includes(first(sp.annee)) ? first(sp.annee) : "";

  const needle = normalizeText(q);
  const filtered = govs
    .filter((g) => !annee || teamYear(g) === annee)
    .filter(
      (g) => !needle || normalizeText(`${g.name} ${g.primeMinister.fullName}`).includes(needle)
    )
    .reverse();

  const byYear = new Map<string, typeof filtered>();
  for (const g of filtered) {
    const y = teamYear(g);
    byYear.set(y, [...(byYear.get(y) ?? []), g]);
  }

  return (
    <>
      <PolitiquesLocalNav current="gouvernements" />
      <div className="container mx-auto flex flex-col gap-6 px-4 pb-10 pt-4">
        <Breadcrumb
          items={[{ label: "Politiques", href: "/politiques" }, { label: "Gouvernements" }]}
        />

        <div className="max-w-2xl">
          <h1 className="text-balance font-display text-3xl font-extrabold tracking-tight md:text-4xl">
            Gouvernements
          </h1>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">
            Retrouvez qui a exercé quelle fonction, dans quel gouvernement et à quelle date, puis
            ouvrez la fiche de chaque personne. Chaque information renvoie à sa source.
          </p>
        </div>

        <CoverageSummary govs={govs} coverage={membersCoverage(govs)} />

        <Link
          href={`${PATH}/membres`}
          className="flex items-center justify-between gap-4 rounded-2xl bg-primary p-5 text-primary-foreground hover:bg-primary/90"
        >
          <span>
            <span className="block font-display text-lg font-bold">Membres des gouvernements</span>
            <span className="mt-1 block text-[13px] opacity-90">
              Personnes distinctes et fonctions regroupées par gouvernement. Filtrez par période,
              gouvernement ou fonction.
            </span>
          </span>
          <ArrowRight className="size-5 shrink-0" aria-hidden="true" />
        </Link>

        <form
          role="search"
          aria-label="Filtrer les gouvernements"
          method="get"
          action={PATH}
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
        >
          <div className="flex flex-1 flex-col gap-1">
            <label htmlFor="gouv-q" className="text-sm font-medium">
              Rechercher
            </label>
            <input
              id="gouv-q"
              type="search"
              name="q"
              defaultValue={q}
              maxLength={MAX_QUERY_LENGTH}
              placeholder="Nom du gouvernement ou du Premier ministre"
              className="h-11 rounded-[10px] border border-input bg-background px-3 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1 sm:min-w-[180px]">
            <label htmlFor="gouv-annee" className="text-sm font-medium">
              Année
            </label>
            <select
              id="gouv-annee"
              name="annee"
              defaultValue={annee}
              className="h-11 rounded-[10px] border border-input bg-background px-3 text-sm"
            >
              <option value="">Toutes</option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" className="min-h-11">
            Filtrer
          </Button>
        </form>

        <section aria-label="Liste des gouvernements" className="flex flex-col gap-6">
          {govs.length === 0 ? (
            <MissingData title="Aucun gouvernement publié">
              Les gouvernements seront listés ici dès que leur composition aura été vérifiée.
            </MissingData>
          ) : filtered.length === 0 ? (
            <MissingData title="Aucun résultat pour ces filtres">
              Aucun gouvernement ne correspond à ces filtres.{" "}
              <Link
                href={PATH}
                className="font-bold text-primary underline-offset-4 hover:underline"
              >
                Réinitialiser les filtres
              </Link>
            </MissingData>
          ) : (
            [...byYear].map(([year, list]) => (
              <div key={year} className="grid gap-3 md:grid-cols-[88px_1fr]">
                <p className="font-display text-xl font-extrabold text-primary md:border-r-2 md:border-primary/30 md:text-2xl">
                  {year}
                </p>
                <div className="flex flex-col gap-3">
                  {list.map((g) => {
                    const present = presentLine(g, data);
                    return (
                      <article key={g.id} className="rounded-2xl border bg-card p-5">
                        <h2 className="font-display text-lg font-bold">
                          <Link
                            href={`${PATH}/${g.slug}`}
                            className="text-foreground underline-offset-4 hover:text-primary hover:underline"
                          >
                            {g.name}
                          </Link>
                        </h2>
                        <p className="mt-1 text-sm">
                          {g.primeMinister.gender === "F"
                            ? "Première ministre"
                            : "Premier ministre"}{" "}
                          : <strong>{g.primeMinister.fullName}</strong>
                        </p>
                        <p className="mt-1 text-[13px] text-muted-foreground">
                          {governmentDatesLine(g)}
                        </p>
                        <div className="mt-3 flex flex-wrap items-center gap-3">
                          <GovernmentBadges gov={g} />
                          <span className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
                            <Users className="size-4" aria-hidden="true" />
                            {participantsLabel(g)}
                            {present && ` · ${present}`}
                          </span>
                        </div>
                        <Button
                          asChild
                          variant="outline"
                          className="mt-4 min-h-11 w-full sm:w-auto"
                        >
                          <Link href={`${PATH}/${g.slug}`}>
                            Voir la composition
                            <ArrowRight aria-hidden="true" />
                          </Link>
                        </Button>
                      </article>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </section>

        <p className="text-[12.5px] text-muted-foreground">
          « Personnes ayant participé » compte chaque personne une fois, quel que soit le nombre de
          ses fonctions. « Présentes de façon établie à une date » est un effectif distinct, indiqué
          en complément pour le gouvernement en exercice.
        </p>
      </div>
    </>
  );
}
