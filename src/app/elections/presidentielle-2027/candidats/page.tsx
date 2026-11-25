import type { Metadata } from "next";
import { cache } from "react";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { BreadcrumbJsonLd, CollectionPageJsonLd, ItemListJsonLd } from "@/components/seo/JsonLd";
import { SITE_URL } from "@/config/site";
import { formatDate } from "@/lib/utils";
import { getHubCandidacyField } from "@/lib/data/hub";
import {
  candidacyFieldDescription,
  candidacyFieldFaq,
  candidacyFieldLead,
  candidacyFieldTitle,
  summarizeCandidacyField,
} from "@/lib/presidentielle/candidacy-field-summary";
import { PRESIDENTIELLE_2027_SLUG } from "@/lib/presidentielle/themes";
import { PRESIDENTIAL_CANDIDATES_FILTER_KEYS } from "@/lib/seo/listing-filters";
import { hasActiveListingFilter } from "@/lib/seo/listing-robots";
import { HubCandidacyField } from "../_components/HubCandidacyField";
import { HubParrainagesEntry } from "../_components/HubPrimaryPaths";
import { PresidentialHubNav } from "../_components/PresidentialHubNav";

export const revalidate = 86400;

const PAGE_PATH = "/elections/presidentielle-2027/candidats";
const getCandidacies = cache(() => getHubCandidacyField(PRESIDENTIELLE_2027_SLUG));

const DEFAULT_TITLE = "Candidats à l'élection présidentielle 2027 : liste et programmes";
const DEFAULT_DESCRIPTION =
  "Liste des candidats et candidatures à l'élection présidentielle 2027, avec leur statut sourcé et les programmes publiés sur Poligraph.";

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

  // The count leads the title and the description: the page answers "how many" before the list.
  const summary = summarizeCandidacyField(candidacies);
  const title = candidacyFieldTitle(summary);

  return {
    // Absolute: the count and the freshness only fit in 60 characters without the site suffix.
    title: title ? { absolute: title } : DEFAULT_TITLE,
    description: candidacyFieldDescription(summary) ?? DEFAULT_DESCRIPTION,
    robots:
      hasUtilityParams || candidacies.length === 0 ? { index: false, follow: true } : undefined,
    alternates: { canonical: PAGE_PATH },
  };
}

export default async function PresidentialCandidatesPage() {
  const candidacies = await getCandidacies();
  const summary = summarizeCandidacyField(candidacies);
  const lead = candidacyFieldLead(summary);
  const faq = candidacyFieldFaq(summary);
  return (
    <main className="container mx-auto space-y-3 px-4 pb-10 pt-4 sm:space-y-8">
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
      <CollectionPageJsonLd
        name="Candidatures à la présidentielle 2027"
        description={candidacyFieldDescription(summary) ?? DEFAULT_DESCRIPTION}
        url={`${SITE_URL}${PAGE_PATH}`}
        numberOfItems={candidacies.length}
        dateModified={summary.lastUpdatedAt?.toISOString()}
      />
      {/* From sm up: on a phone the hub tabs right below are the way back, and the lone back link
          pushed the page down. The breadcrumb JSON-LD is emitted at every width. */}
      <div className="max-sm:hidden">
        <Breadcrumb
          items={[
            { label: "Élections", href: "/elections" },
            { label: "Présidentielle 2027", href: "/elections/presidentielle-2027" },
            { label: "Candidatures" },
          ]}
        />
      </div>
      <PresidentialHubNav active="candidates" />
      <header className="max-w-4xl space-y-3">
        {/* From sm up: on a phone the breadcrumb and the hub navigation already say it. */}
        <p className="hidden text-xs font-bold uppercase tracking-widest text-brand sm:block">
          Présidentielle 2027
        </p>
        <h1 className="font-display text-xl font-extrabold tracking-tight sm:text-3xl md:text-5xl">
          Candidatures à la présidentielle 2027
        </h1>
        {/* The answer to "how many", on every width, before the list. */}
        {lead && <p className="max-w-3xl text-base leading-relaxed sm:text-lg">{lead}</p>}
        {summary.lastUpdatedAt && (
          <p className="text-xs text-muted-foreground">
            Liste mise à jour le{" "}
            <time dateTime={summary.lastUpdatedAt.toISOString()}>
              {formatDate(summary.lastUpdatedAt)}
            </time>
          </p>
        )}
        {/* The caveat is a matter of method and stays at every width; a phone gets it in one
            short sentence so the list starts on the first screen. */}
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground max-sm:hidden">
          Cette liste de suivi n&apos;est pas un substitut à la liste officielle publiée par le
          Conseil constitutionnel. Chaque statut est sourcé. L&apos;ordre par défaut est
          alphabétique, sans classement.
        </p>
        <p className="text-xs text-muted-foreground sm:hidden">
          Liste de suivi, pas la liste officielle du Conseil constitutionnel.
        </p>
      </header>
      <HubCandidacyField candidacies={candidacies} />
      {/* The sponsorships are read candidate by candidate: this list is where a reader looks for
          them, and until now only the hub home linked to that page. */}
      <HubParrainagesEntry />
      {faq.length > 0 && (
        <section aria-labelledby="questions-candidats" className="max-w-3xl space-y-4">
          <h2 id="questions-candidats" className="font-display text-xl font-bold sm:text-2xl">
            Questions fréquentes
          </h2>
          {faq.map((entry) => (
            <div key={entry.question} className="space-y-1">
              <h3 className="font-semibold">{entry.question}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{entry.answer}</p>
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
