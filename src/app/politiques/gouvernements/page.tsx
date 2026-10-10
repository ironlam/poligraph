import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Users } from "lucide-react";
import { PRESIDENCIES, presidencyOfGovernment } from "@/config/presidencies";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Button } from "@/components/ui/button";
import { MissingData } from "@/components/ui/MissingData";
import { CoverageSummary } from "@/components/governments/CoverageSummary";
import { GovernmentBadges } from "@/components/governments/GovernmentBadges";
import { PolitiquesLocalNav } from "@/components/governments/PolitiquesLocalNav";
import {
  formatDay,
  governmentPeriod,
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
import { GOUVERNEMENTS_LISTING_FILTER_KEYS } from "@/lib/seo/listing-filters";
import { hasActiveListingFilter, listingRobotsMetadata } from "@/lib/seo/listing-robots";

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
  const params = Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, first(v)]));
  const title = "Gouvernements français : composition et ministres";
  const description =
    "Composition de chaque gouvernement publié, date par date : qui a exercé quelle fonction, avec la source officielle de chaque nomination.";
  return {
    title,
    description,
    alternates: { canonical: PATH },
    openGraph: {
      title: `${title} | Poligraph`,
      description,
      url: PATH,
      type: "website",
      siteName: "Poligraph",
      locale: "fr_FR",
    },
    twitter: { card: "summary_large_image", title, description },
    ...listingRobotsMetadata(hasActiveListingFilter(params, GOUVERNEMENTS_LISTING_FILTER_KEYS)),
  };
}

const OTHER_GROUP = { slug: "autres", heading: "Autres gouvernements", name: "Autres" };

/** Presidency group of a government; never expected outside one, kept visible if it happens. */
function groupOf(g: PublishedGovernment) {
  return presidencyOfGovernment(g) ?? OTHER_GROUP;
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
  // Presidencies with at least one published government, most recent first. The former `annee`
  // parameter stays a noindex filter key but is ignored here.
  const presidencies = PRESIDENCIES.filter((p) =>
    govs.some((g) => presidencyOfGovernment(g)?.slug === p.slug)
  ).reverse();
  const presidence = presidencies.some((p) => p.slug === first(sp.presidence))
    ? first(sp.presidence)
    : "";

  const needle = normalizeText(q);
  const filtered = govs
    .filter((g) => !presidence || presidencyOfGovernment(g)?.slug === presidence)
    .filter(
      (g) => !needle || normalizeText(`${g.name} ${g.primeMinister.fullName}`).includes(needle)
    )
    .reverse();

  const groups = new Map<
    string,
    { slug: string; heading: string; name: string; list: typeof filtered }
  >();
  for (const g of filtered) {
    const { slug, heading, name } = groupOf(g);
    const group = groups.get(slug) ?? { slug, heading, name, list: [] };
    group.list.push(g);
    groups.set(slug, group);
  }

  return (
    <>
      <PolitiquesLocalNav current="gouvernements" />
      <div className="container mx-auto flex flex-col gap-6 px-4 pb-10 pt-4">
        <Breadcrumb
          items={[
            { label: "Politiques", href: "/politiques" },
            { label: "Gouvernements", href: PATH },
          ]}
        />

        <div className="max-w-2xl">
          <h1 className="text-balance font-display text-3xl font-extrabold tracking-tight md:text-4xl">
            Gouvernements
          </h1>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">
            Retrouvez qui a exercé quelle fonction, dans quel gouvernement et à quelle date, puis
            ouvrez la fiche de chaque personne. Chaque nomination et chaque fin de fonction renvoie
            à son acte officiel quand il existe.
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
          <div className="flex flex-col gap-1 sm:min-w-[220px]">
            <label htmlFor="gouv-presidence" className="text-sm font-medium">
              Présidence
            </label>
            <select
              id="gouv-presidence"
              name="presidence"
              defaultValue={presidence}
              className="h-11 rounded-[10px] border border-input bg-background px-3 text-sm"
            >
              <option value="">Toutes</option>
              {presidencies.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" className="min-h-11">
            Filtrer
          </Button>
        </form>

        <div className="flex flex-col gap-6">
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
            <>
              {groups.size > 1 && (
                <nav aria-label="Aller à une présidence" className="flex flex-wrap gap-2">
                  {[...groups.values()].map((group) => (
                    <a
                      key={group.slug}
                      href={`#presidence-${group.slug}`}
                      className="inline-flex min-h-11 items-center rounded-full border bg-card px-4 text-sm font-medium hover:border-primary/40 hover:bg-muted/50"
                    >
                      {group.name}
                    </a>
                  ))}
                </nav>
              )}
              {[...groups.values()].map((group) => (
                <section
                  key={group.slug}
                  id={`presidence-${group.slug}`}
                  aria-labelledby={`presidence-${group.slug}-titre`}
                  className="flex scroll-mt-24 flex-col gap-3"
                >
                  <h2
                    id={`presidence-${group.slug}-titre`}
                    className="font-display text-xl font-extrabold text-primary md:text-2xl"
                  >
                    {group.heading}
                  </h2>
                  <div className="grid gap-3 md:grid-cols-2">
                    {group.list.map((g) => {
                      const present = presentLine(g, data);
                      return (
                        <article
                          key={g.id}
                          className="relative rounded-2xl border bg-card p-5 transition-colors has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-ring hover:border-primary/40"
                        >
                          <h3 className="font-display text-lg font-bold">
                            {/* The link covers the whole card (after:inset-0): one <a> per card. */}
                            <Link
                              href={`${PATH}/${g.slug}`}
                              className="text-foreground underline-offset-4 outline-none after:absolute after:inset-0 after:rounded-2xl after:content-[''] hover:text-primary hover:underline"
                            >
                              {g.name}
                            </Link>
                          </h3>
                          <p className="mt-1 text-[13px] text-muted-foreground">
                            {governmentPeriod(g)}
                          </p>
                          <div className="mt-3 flex flex-wrap items-center gap-3">
                            <GovernmentBadges gov={g} showEnded={false} />
                            <span className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
                              <Users className="size-4" aria-hidden="true" />
                              {participantsLabel(g)}
                              {present && ` · ${present}`}
                            </span>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              ))}
            </>
          )}
        </div>

        <p className="text-[12.5px] text-muted-foreground">
          « Personnes ayant participé » compte chaque personne une fois, quel que soit le nombre de
          ses fonctions. « Présentes de façon établie à une date » est un effectif distinct, indiqué
          en complément pour le gouvernement en exercice.
        </p>
      </div>
    </>
  );
}
