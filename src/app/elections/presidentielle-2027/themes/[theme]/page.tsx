import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { THEME_CATEGORY_LABELS } from "@/config/labels";
import { getSubjectPageData } from "@/lib/data/subject-page";
import { parseThemeSlug, PRESIDENTIELLE_2027_SLUG } from "@/lib/presidentielle/themes";
import { SubjectComparison } from "./_components/SubjectComparison";

// ISR: 24h backstop. Real changes propagate on demand: a measure write busts election-measures:<id>.
export const revalidate = 86400;

interface PageProps {
  params: Promise<{ theme: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { theme: themeParam } = await params;
  const theme = parseThemeSlug(themeParam);
  if (theme === null) {
    return {
      title: "Thème introuvable | Présidentielle 2027",
      robots: { index: false, follow: true },
    };
  }

  const data = await getSubjectPageData(PRESIDENTIELLE_2027_SLUG, theme);
  const label = THEME_CATEGORY_LABELS[theme];
  // The subject page stays out of the index until it clears its publication gate (spec §4): below the
  // gate there is no comparison to index, only an explicit "not yet available" state.
  const publishable = data?.publishable ?? false;

  return {
    title: `${label} : les mesures des candidats | Présidentielle 2027`,
    description: `Ce que les candidats à la présidentielle 2027 proposent sur le thème ${label}.`,
    robots: publishable ? undefined : { index: false, follow: true },
  };
}

export default async function SubjectPage({ params }: PageProps) {
  const { theme: themeParam } = await params;
  const theme = parseThemeSlug(themeParam);
  if (theme === null) notFound();

  const data = await getSubjectPageData(PRESIDENTIELLE_2027_SLUG, theme);
  if (data === null) notFound();

  return (
    <div className="container mx-auto space-y-4 px-4 pt-4 pb-8">
      <Breadcrumb
        items={[
          { label: "Élections", href: "/elections" },
          { label: "Présidentielle 2027", href: "/elections/presidentielle-2027" },
          { label: "Thématiques", href: "/elections/presidentielle-2027/themes" },
          { label: THEME_CATEGORY_LABELS[theme] },
        ]}
      />
      <SubjectComparison data={data} />
    </div>
  );
}
