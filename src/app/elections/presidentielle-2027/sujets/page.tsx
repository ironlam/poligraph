import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { getThemesIndex } from "@/lib/data/themes-index";
import { isHubPublishable } from "@/config/publication-gates";
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
    title: "Les 13 sujets de la présidentielle 2027 | Poligraph",
    description:
      "Le logement, la santé, l'environnement et les autres sujets de la présidentielle 2027, avec les mesures documentées de chaque candidature.",
    robots: publishable ? undefined : { index: false, follow: true },
  };
}

export default async function ThemesIndexPage() {
  const data = await getThemesIndex(PRESIDENTIELLE_2027_SLUG);
  if (data === null) notFound();

  return (
    <div className="container mx-auto px-4 pt-4 pb-8">
      <Breadcrumb
        items={[
          { label: "Élections", href: "/elections" },
          { label: "Présidentielle 2027", href: "/elections/presidentielle-2027" },
          { label: "Sujets" },
        ]}
      />

      <h1 className="text-3xl font-display font-extrabold tracking-tight mb-2">
        Quel sujet vous concerne ?
      </h1>
      <p className="text-muted-foreground mb-6">
        Le chiffre affiché sous chaque sujet correspond au nombre de mesures documentées pour ce
        thème, à date.
      </p>

      <ThemesIndexList data={data} />
    </div>
  );
}
