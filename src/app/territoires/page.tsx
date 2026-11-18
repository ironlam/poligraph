import type { Metadata } from "next";
import { getTerritoiresEntry } from "@/lib/data/territoires";
import { isFeatureEnabled } from "@/lib/feature-flags";
import Link from "next/link";
import { TERRITOIRES_DONNEES_PATH, TERRITOIRES_PATH } from "@/lib/territoires/paths";
import { SITE_URL } from "@/config/site";
import { BreadcrumbJsonLd } from "@/components/seo/JsonLd";
import { EntreeHero } from "@/components/territoires/EntreeHero";
import { EntreeAccesRapides } from "@/components/territoires/EntreeAccesRapides";
import { CouvertureEntree, EntreeRegions } from "@/components/territoires/EntreeRegions";
import { openGraph, SEGMENT_IMAGE_FILE } from "@/lib/seo/open-graph";

/*
 * Rendered once and cached: this page reads no searchParams. The search form submits to
 * /territoires/recherche, a separate dynamic route, so a query never turns this page dynamic.
 */

const DESCRIPTION =
  "Maire, députés, sénateurs et résultats des municipales 2026 pour chaque commune, avec la source officielle de chaque information. Recherche par nom de commune ou code postal.";

export const metadata: Metadata = {
  title: "Territoires : élus et résultats par commune, département et région",
  description: DESCRIPTION,
  alternates: { canonical: TERRITOIRES_PATH },
  openGraph: openGraph({
    title: "Les élus et les décisions de votre territoire",
    description: DESCRIPTION,
    url: TERRITOIRES_PATH,
    images: SEGMENT_IMAGE_FILE,
  }),
};

export default async function TerritoiresPage() {
  const [entry, monDepute] = await Promise.all([
    getTerritoiresEntry(),
    isFeatureEnabled("MON_DEPUTE_SECTION"),
  ]);

  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: "Accueil", url: SITE_URL },
          { name: "Territoires", url: `${SITE_URL}${TERRITOIRES_PATH}` },
        ]}
      />
      <EntreeHero />
      <div className="container mx-auto space-y-10 px-4 py-8 sm:py-10">
        <EntreeAccesRapides monDepute={monDepute} />
        <EntreeRegions entry={entry} />
        <CouvertureEntree national={entry.national} />
        <p className="text-sm">
          <Link
            href={TERRITOIRES_DONNEES_PATH}
            prefetch={false}
            className="inline-flex min-h-11 items-center underline underline-offset-4"
          >
            Télécharger les données (CSV) et leurs licences
          </Link>
        </p>
      </div>
    </>
  );
}
