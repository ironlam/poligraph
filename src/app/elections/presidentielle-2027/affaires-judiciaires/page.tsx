import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { AffairListingCard } from "@/components/affairs/AffairListingCard";
import { CollectionPageJsonLd } from "@/components/seo/JsonLd";
import { SITE_URL } from "@/config/site";
import { AFFAIRS_PAGE_SIZE, getPresidentialAffairs } from "@/lib/data/presidentielle-affaires";
import {
  PRESIDENTIAL_AFFAIRS_PATH,
  buildPresidentialAffairsHref,
  parsePresidentialAffairsPage,
  parsePresidentialAffairsSort,
} from "@/lib/presidentielle/affaires-listing";
import { PRESIDENTIELLE_2027_SLUG } from "@/lib/presidentielle/themes";
import { PRESIDENTIAL_AFFAIRS_FILTER_KEYS } from "@/lib/seo/listing-filters";
import { hasActiveListingFilter, listingRobotsMetadata } from "@/lib/seo/listing-robots";
import { PresidentialAffairsFilters } from "../_components/PresidentialAffairsFilters";

export const revalidate = 86400;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams?: Promise<{
    page?: string | string[];
    candidat?: string | string[];
    tri?: string | string[];
  }>;
}): Promise<Metadata> {
  const data = await getPresidentialAffairs(PRESIDENTIELLE_2027_SLUG);
  const params = await searchParams;
  const urlState = {
    page: first(params?.page),
    candidat: first(params?.candidat),
    tri: first(params?.tri),
  };

  return {
    title: "Affaires judiciaires des candidats à la présidentielle 2027",
    description:
      "Affaires judiciaires documentées des candidats et personnalités suivies pour la présidentielle 2027. Procédures, décisions et sources vérifiables, avec présomption d'innocence.",
    ...listingRobotsMetadata(
      data.total === 0 || hasActiveListingFilter(urlState, PRESIDENTIAL_AFFAIRS_FILTER_KEYS)
    ),
    alternates: { canonical: PRESIDENTIAL_AFFAIRS_PATH },
  };
}

export default async function PresidentialAffairsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    page?: string | string[];
    candidat?: string | string[];
    tri?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const page = parsePresidentialAffairsPage(first(params?.page));
  const data = await getPresidentialAffairs(PRESIDENTIELLE_2027_SLUG, {
    page,
    candidat: first(params?.candidat),
    tri: parsePresidentialAffairsSort(first(params?.tri)),
  });
  const totalPages = Math.ceil(data.total / AFFAIRS_PAGE_SIZE);
  const current = { candidat: data.candidat, tri: data.tri };
  const selectedName = data.candidates.find((c) => c.slug === data.candidat)?.fullName;

  return (
    <div className="container mx-auto space-y-6 px-4 pb-10 pt-4 md:space-y-8">
      <CollectionPageJsonLd
        name="Affaires judiciaires des candidats à la présidentielle 2027"
        description="Affaires judiciaires documentées des candidats et personnalités suivies pour la présidentielle 2027."
        url={`${SITE_URL}${PRESIDENTIAL_AFFAIRS_PATH}`}
        numberOfItems={data.total}
      />
      <Breadcrumb
        items={[
          { label: "Élections", href: "/elections" },
          { label: "Présidentielle 2027", href: "/elections/presidentielle-2027" },
          { label: "Affaires judiciaires" },
        ]}
      />

      <header className="max-w-3xl space-y-2 md:space-y-3">
        <p className="text-xs font-bold uppercase tracking-widest text-brand-on-surface">
          Présidentielle 2027
        </p>
        <h1 className="font-display text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl md:text-5xl">
          Affaires judiciaires des candidats à la présidentielle 2027
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground md:text-lg">
          Les affaires publiées concernant les candidats et personnalités suivies, avec leurs
          sources. Procédures en cours, décisions et issues favorables sont distinguées.
        </p>
      </header>

      {/* Kept visible above the list on every screen size: the presumption of innocence is a
          legal mention (art. 9-1 C. civ.), not a detail to fold away on mobile. */}
      <aside
        className="max-w-3xl rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm leading-relaxed text-muted-foreground md:p-5"
        aria-label="Présomption d'innocence"
      >
        <strong className="text-foreground">Une affaire n&apos;est pas une condamnation.</strong>{" "}
        Les personnes concernées bénéficient de la présomption d&apos;innocence tant qu&apos;une
        décision définitive ne l&apos;a pas écartée.
      </aside>

      {data.candidates.length > 0 && (
        <PresidentialAffairsFilters
          candidates={data.candidates}
          current={current}
          total={data.total}
        />
      )}

      {data.affairs.length > 0 ? (
        <section aria-labelledby="affairs-list-title" className="space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 id="affairs-list-title" className="font-display text-xl font-bold md:text-2xl">
              {data.total} affaire{data.total > 1 ? "s" : ""} documentée{data.total > 1 ? "s" : ""}
              {selectedName && (
                <span className="font-normal text-muted-foreground"> · {selectedName}</span>
              )}
            </h2>
            {totalPages > 1 && (
              <p className="text-sm text-muted-foreground">
                Page {page} sur {totalPages}
              </p>
            )}
          </div>
          <ul className="space-y-4">
            {data.affairs.map((affair, index) => {
              const startsGroup =
                data.tri === "candidat" &&
                data.affairs[index - 1]?.politician.slug !== affair.politician.slug;
              return (
                <li key={affair.id}>
                  {startsGroup && (
                    <p
                      className={`mb-2 border-b pb-1 text-base font-semibold ${index > 0 ? "mt-6" : ""}`}
                    >
                      <Link
                        href={buildPresidentialAffairsHref({
                          candidat: affair.politician.slug,
                          tri: "recentes",
                        })}
                        className="text-primary underline-offset-4 hover:underline"
                        prefetch={false}
                      >
                        {affair.politician.fullName}
                      </Link>
                    </p>
                  )}
                  <AffairListingCard affair={affair} />
                </li>
              );
            })}
          </ul>
          {totalPages > 1 && (
            <nav
              aria-label="Pagination des affaires judiciaires"
              className="flex items-center justify-between gap-3 pt-2"
            >
              {page > 1 ? (
                <Link
                  href={buildPresidentialAffairsHref({ ...current, page: page - 1 })}
                  className="inline-flex min-h-11 items-center rounded-lg border px-4 text-sm font-semibold text-primary hover:bg-muted"
                  prefetch={false}
                >
                  ← Précédente
                </Link>
              ) : (
                <span />
              )}
              {page < totalPages && (
                <Link
                  href={buildPresidentialAffairsHref({ ...current, page: page + 1 })}
                  className="inline-flex min-h-11 items-center rounded-lg border px-4 text-sm font-semibold text-primary hover:bg-muted"
                  prefetch={false}
                >
                  Suivante →
                </Link>
              )}
            </nav>
          )}
        </section>
      ) : (
        <section className="rounded-2xl border border-border bg-card p-6">
          <h2 className="font-display text-xl font-bold">La page est en préparation</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Les affaires seront affichées après vérification éditoriale et rattachement à une
            candidature sourcée.
          </p>
        </section>
      )}

      <p className="text-sm text-muted-foreground">
        <Link
          href="/affaires/condamnations"
          className="text-primary underline-offset-4 hover:underline"
        >
          Consulter aussi les condamnations des responsables politiques
        </Link>
      </p>
    </div>
  );
}
