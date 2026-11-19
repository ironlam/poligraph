import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { AffairItemListJsonLd } from "@/components/seo/JsonLd";
import { SITE_URL } from "@/config/site";
import { getThemesIndex } from "@/lib/data/themes-index";
import { isHubPublishable, PUBLICATION_GATES } from "@/config/publication-gates";
import { PRESIDENTIELLE_2027_SLUG } from "@/lib/presidentielle/themes";
import { PresidentialHubNav } from "../_components/PresidentialHubNav";
import { ThemesIndexList } from "./_components/ThemesIndexList";

// ISR: 24h backstop. Real changes propagate on demand: a measure write busts election-measures:<id>.
export const revalidate = 86400;

export async function generateMetadata(): Promise<Metadata> {
  const data = await getThemesIndex(PRESIDENTIELLE_2027_SLUG);
  // The index stays out of search results until at least one subject page clears its
  // publication gate: below that, there is nothing to send readers to yet.
  const publishable = data !== null && isHubPublishable(data.publishableSubjectPageCount);

  return {
    title: "Programmes par thème, présidentielle 2027",
    description:
      "Comparez les mesures publiées des candidats à la présidentielle 2027 sur le logement, la santé, l'économie, l'écologie et les autres thèmes.",
    robots: publishable ? undefined : { index: false, follow: true },
    alternates: { canonical: "/elections/presidentielle-2027/themes" },
  };
}

export default async function ThemesIndexPage() {
  const data = await getThemesIndex(PRESIDENTIELLE_2027_SLUG);
  if (data === null) notFound();
  const required = PUBLICATION_GATES.pageSujet.minCandidaciesWithVerifiedMeasure;

  return (
    <div className="container mx-auto px-4 pt-4 pb-8">
      {/* From sm up: on a phone the hub tabs right below are the way back, and the lone back link
          pushed the page down. The breadcrumb JSON-LD is emitted at every width. */}
      <div className="max-sm:hidden">
        <Breadcrumb
          items={[
            { label: "Élections", href: "/elections" },
            { label: "Présidentielle 2027", href: "/elections/presidentielle-2027" },
            { label: "Thématiques" },
          ]}
        />
      </div>

      <PresidentialHubNav active="themes" />

      {/* A plain ItemList of links, despite the helper's name: one entry per theme page. */}
      <AffairItemListJsonLd
        name="Programmes par thème, présidentielle 2027"
        items={data.themes.map((entry) => ({
          name: entry.label,
          url: `${SITE_URL}/elections/presidentielle-2027/themes/${entry.slug}`,
        }))}
      />

      <div className="mt-4 space-y-4 sm:mt-8 sm:space-y-6">
        <header className="max-w-3xl space-y-2">
          <h1 className="font-display text-xl font-extrabold tracking-tight sm:text-3xl md:text-4xl">
            Programmes par thème
          </h1>
          {/* From sm up: on a phone the list starts right under the title, and the row itself
              says what a tap does. */}
          <p className="text-muted-foreground max-sm:hidden">
            Choisissez un thème pour consulter côte à côte les mesures publiées des candidats.
          </p>
        </header>

        <ThemesIndexList data={data} />

        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 border-t border-border pt-2">
          {/* Collapsed, but in the served HTML: a tooltip would keep this text away from crawlers
              and answer engines. */}
          <details className="max-w-2xl text-sm text-muted-foreground">
            <summary className="flex min-h-11 cursor-pointer items-center font-medium text-foreground">
              Comment lire ces chiffres
            </summary>
            <div className="space-y-2 pb-3 text-xs leading-relaxed">
              <p>
                La comparaison d&apos;un thème s&apos;ouvre dès que {required} candidats y ont au
                moins une mesure sourcée et relue. En dessous, le thème est marqué « pas encore
                comparable ».
              </p>
              <p>
                Ces chiffres décrivent les contenus publiés par Poligraph, pas la totalité de la
                campagne. Une mesure retirée reste visible dans l&apos;historique, mais elle est
                distinguée des propositions toujours portées.
              </p>
            </div>
          </details>
          <Link
            href="/methodologie/mesures-presidentielle-2027"
            className="inline-flex min-h-11 items-center text-sm font-medium underline hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Méthode et sources
          </Link>
        </div>
      </div>
    </div>
  );
}
