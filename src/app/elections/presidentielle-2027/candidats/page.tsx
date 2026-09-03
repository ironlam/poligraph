import type { Metadata } from "next";
import { cache } from "react";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { BreadcrumbJsonLd, ItemListJsonLd } from "@/components/seo/JsonLd";
import { SITE_URL } from "@/config/site";
import { getHubCandidacyField } from "@/lib/data/hub";
import { PRESIDENTIELLE_2027_SLUG } from "@/lib/presidentielle/themes";
import { PRESIDENTIAL_CANDIDATES_FILTER_KEYS } from "@/lib/seo/listing-filters";
import { hasActiveListingFilter } from "@/lib/seo/listing-robots";
import { HubCandidacyField } from "../_components/HubCandidacyField";
import { PresidentialHubNav } from "../_components/PresidentialHubNav";

export const revalidate = 86400;

const PAGE_PATH = "/elections/presidentielle-2027/candidats";
const getCandidacies = cache(() => getHubCandidacyField(PRESIDENTIELLE_2027_SLUG));

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const [params, candidacies] = await Promise.all([searchParams, getCandidacies()]);
  // Filtered and searched variants are useful navigation surfaces, but duplicate the same finite
  // directory. Keep discovery through their links without asking search engines to index them.
  const normalizedParams = Object.fromEntries(
    Object.entries(params).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value])
  );
  const hasUtilityParams = hasActiveListingFilter(
    normalizedParams,
    PRESIDENTIAL_CANDIDATES_FILTER_KEYS
  );

  return {
    title: "Présidentielle 2027 : candidatures et programmes",
    description:
      "Les candidatures annoncées et les personnalités suivies pour la présidentielle 2027, avec leur statut sourcé et les propositions publiées sur Poligraph.",
    robots:
      hasUtilityParams || candidacies.length === 0 ? { index: false, follow: true } : undefined,
    alternates: { canonical: PAGE_PATH },
  };
}

export default async function PresidentialCandidatesPage() {
  const candidacies = await getCandidacies();
  return (
    <main className="container mx-auto space-y-8 px-4 pb-10 pt-4">
      <BreadcrumbJsonLd
        items={[
          { name: "Présidentielle 2027", url: `${SITE_URL}/elections/presidentielle-2027` },
          { name: "Candidatures", url: `${SITE_URL}${PAGE_PATH}` },
        ]}
      />
      <ItemListJsonLd
        name="Candidatures et personnalités suivies pour la présidentielle 2027"
        description="Liste alphabétique des candidatures sourcées et des personnalités suivies par Poligraph."
        url={`${SITE_URL}${PAGE_PATH}`}
        items={candidacies.map((candidacy) => ({
          name: candidacy.candidateName,
          url: `${SITE_URL}${PAGE_PATH}/${candidacy.politicianSlug}`,
          image: candidacy.blobPhotoUrl ?? candidacy.photoUrl ?? undefined,
        }))}
      />
      <Breadcrumb
        items={[
          { label: "Élections", href: "/elections" },
          { label: "Présidentielle 2027", href: "/elections/presidentielle-2027" },
          { label: "Candidatures" },
        ]}
      />
      <PresidentialHubNav active="candidates" />
      <header className="max-w-4xl space-y-3">
        <p className="text-xs font-bold uppercase tracking-widest text-brand">
          Présidentielle 2027
        </p>
        <h1 className="font-display text-3xl font-extrabold tracking-tight md:text-5xl">
          Candidatures à la présidentielle 2027
        </h1>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Cette liste n&apos;est pas la liste officielle des candidats. Chaque statut est sourcé et
          l&apos;ordre reste alphabétique, sans classement.
        </p>
      </header>
      <HubCandidacyField candidacies={candidacies} />
    </main>
  );
}
