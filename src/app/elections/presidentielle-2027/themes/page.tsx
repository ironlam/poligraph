import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
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
    title: "Programmes par thème, présidentielle 2027 | Poligraph",
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
      <Breadcrumb
        items={[
          { label: "Élections", href: "/elections" },
          { label: "Présidentielle 2027", href: "/elections/presidentielle-2027" },
          { label: "Thématiques" },
        ]}
      />

      <PresidentialHubNav active="themes" />

      <div className="mt-8 space-y-6">
        <header className="max-w-3xl space-y-2">
          <h1 className="font-display text-3xl font-extrabold tracking-tight md:text-4xl">
            Comparer les programmes par thème
          </h1>
          <p className="text-muted-foreground">
            Choisissez un thème pour consulter côte à côte les mesures publiées des candidats. La
            comparaison devient disponible dès que {required} candidats ont au moins une mesure
            sourcée et relue sur ce thème.
          </p>
        </header>

        <ThemesIndexList data={data} />

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-4">
          <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">
            Ces chiffres décrivent les contenus publiés par Poligraph, pas la totalité de la
            campagne. Une mesure retirée reste visible dans l&apos;historique, mais elle est
            distinguée des propositions toujours portées.
          </p>
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
