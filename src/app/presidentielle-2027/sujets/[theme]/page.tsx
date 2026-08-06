import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ThemeCategory } from "@/generated/prisma";
import { THEME_CATEGORY_LABELS } from "@/config/labels";
import { getSubjectPageData } from "@/lib/data/subject-page";
import { SubjectComparison } from "./_components/SubjectComparison";

// ISR: 24h backstop. Real changes propagate on demand: a measure write busts election-measures:<id>.
export const revalidate = 86400;

const ELECTION_SLUG = "presidentielle-2027";

/** URL slug (logement-urbanisme) <-> enum (LOGEMENT_URBANISME), deterministic in both directions. */
function parseThemeParam(param: string): ThemeCategory | null {
  const candidate = param.toUpperCase().replace(/-/g, "_");
  return candidate in THEME_CATEGORY_LABELS ? (candidate as ThemeCategory) : null;
}

interface PageProps {
  params: Promise<{ theme: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { theme: themeParam } = await params;
  const theme = parseThemeParam(themeParam);
  if (theme === null) {
    return {
      title: "Sujet introuvable | Présidentielle 2027",
      robots: { index: false, follow: false },
    };
  }

  const data = await getSubjectPageData(ELECTION_SLUG, theme);
  const label = THEME_CATEGORY_LABELS[theme];
  // The subject page stays out of the index until it clears its publication gate (spec §4): below the
  // gate there is no comparison to index, only an explicit "not yet available" state.
  const publishable = data?.publishable ?? false;

  return {
    title: `${label} : les mesures des candidats | Présidentielle 2027`,
    description: `Ce que les candidats à la présidentielle 2027 proposent sur le thème ${label}.`,
    robots: publishable ? undefined : { index: false, follow: false },
  };
}

export default async function SubjectPage({ params }: PageProps) {
  const { theme: themeParam } = await params;
  const theme = parseThemeParam(themeParam);
  if (theme === null) notFound();

  const data = await getSubjectPageData(ELECTION_SLUG, theme);
  if (data === null) notFound();

  return <SubjectComparison data={data} />;
}
