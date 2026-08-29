import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { getThemesIndex } from "@/lib/data/themes-index";
import { isHubPublishable, PUBLICATION_GATES } from "@/config/publication-gates";
import { PRESIDENTIELLE_2027_SLUG } from "@/lib/presidentielle/themes";
import { ThemesIndexList } from "./_components/ThemesIndexList";

// ISR: 24h backstop. Real changes propagate on demand: a measure write busts election-measures:<id>.
export const revalidate = 86400;

export async function generateMetadata(): Promise<Metadata> {
  const data = await getThemesIndex(PRESIDENTIELLE_2027_SLUG);
  // The index stays out of search results until at least one subject page clears its
  // publication gate: below that, there is nothing to send readers to yet.
  const publishable = data !== null && isHubPublishable(data.publishableSubjectPageCount);

  return {
    title: "Couverture du corpus par thématique, présidentielle 2027 | Poligraph",
    description:
      "Candidatures documentées, mesures publiées et dernière revue éditoriale du corpus Poligraph pour chaque thématique de la présidentielle 2027.",
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

      <div className="space-y-6">
        <header className="max-w-3xl space-y-2">
          <Link
            href="/elections/presidentielle-2027"
            className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            Retour au hub
          </Link>
          <h1 className="font-display text-3xl font-extrabold tracking-tight md:text-4xl">
            Où en est le corpus, thématique par thématique ?
          </h1>
          <p className="text-muted-foreground">
            Une thématique s&apos;ouvre à la comparaison à partir de {required} candidatures portant
            une mesure sourcée et relue.
          </p>
        </header>

        <ThemesIndexList data={data} />

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-4">
          <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">
            Ces compteurs décrivent le corpus Poligraph, pas la totalité de la campagne. Une mesure
            documentée reste comptée dans l&apos;historique après son retrait, mais plus parmi les
            mesures actuellement défendues.
          </p>
          <Link
            href="/methodologie"
            className="inline-flex min-h-11 items-center text-sm font-medium underline hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Méthode et sources
          </Link>
        </div>
      </div>
    </div>
  );
}
