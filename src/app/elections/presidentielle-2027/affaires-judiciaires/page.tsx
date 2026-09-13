import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { AffairListingCard } from "@/components/affairs/AffairListingCard";
import { CollectionPageJsonLd } from "@/components/seo/JsonLd";
import { SITE_URL } from "@/config/site";
import { getPresidentialAffairs } from "@/lib/data/presidentielle-affaires";
import { PRESIDENTIELLE_2027_SLUG } from "@/lib/presidentielle/themes";

export const revalidate = 86400;

const PAGE_PATH = "/elections/presidentielle-2027/affaires-judiciaires";

export async function generateMetadata(): Promise<Metadata> {
  const data = await getPresidentialAffairs(PRESIDENTIELLE_2027_SLUG);

  return {
    title: "Affaires judiciaires des candidats à la présidentielle 2027",
    description:
      "Affaires judiciaires documentées des candidats et personnalités suivies pour la présidentielle 2027. Procédures, décisions et sources vérifiables, avec présomption d'innocence.",
    robots: data.total > 0 ? undefined : { index: false, follow: true },
    alternates: { canonical: PAGE_PATH },
  };
}

export default async function PresidentialAffairsPage() {
  const data = await getPresidentialAffairs(PRESIDENTIELLE_2027_SLUG);

  return (
    <main className="container mx-auto space-y-8 px-4 pb-10 pt-4">
      <CollectionPageJsonLd
        name="Affaires judiciaires des candidats à la présidentielle 2027"
        description="Affaires judiciaires documentées des candidats et personnalités suivies pour la présidentielle 2027."
        url={`${SITE_URL}${PAGE_PATH}`}
        numberOfItems={data.total}
      />
      <Breadcrumb
        items={[
          { label: "Élections", href: "/elections" },
          { label: "Présidentielle 2027", href: "/elections/presidentielle-2027" },
          { label: "Affaires judiciaires" },
        ]}
      />

      <header className="max-w-3xl space-y-3">
        <p className="text-xs font-bold uppercase tracking-widest text-brand-on-surface">
          Présidentielle 2027
        </p>
        <h1 className="font-display text-3xl font-extrabold leading-tight tracking-tight md:text-5xl">
          Affaires judiciaires des candidats à la présidentielle 2027
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground md:text-lg">
          Retrouvez les affaires judiciaires publiées concernant les candidats et personnalités
          suivies pour l&apos;élection. Chaque fiche est accompagnée de sources vérifiables et
          distingue les procédures en cours, les décisions et les issues favorables.
        </p>
      </header>

      <section
        className="rounded-2xl border border-border bg-muted/30 p-5"
        aria-labelledby="method-title"
      >
        <h2 id="method-title" className="font-display text-lg font-bold">
          Une lecture factuelle des procédures
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Une affaire n&apos;est pas une condamnation. Les personnes concernées bénéficient de la
          présomption d&apos;innocence tant qu&apos;une décision définitive ne l&apos;a pas écartée.
          Les statuts, rôles et sources sont affichés séparément pour éviter toute confusion.
        </p>
      </section>

      {data.affairs.length > 0 ? (
        <section aria-labelledby="affairs-list-title" className="space-y-4">
          <div>
            <h2 id="affairs-list-title" className="font-display text-2xl font-bold">
              {data.total} affaire{data.total > 1 ? "s" : ""} documentée{data.total > 1 ? "s" : ""}
            </h2>
            {data.total > data.affairs.length && (
              <p className="mt-1 text-sm text-muted-foreground">
                Les {data.affairs.length} fiches les plus récentes sont affichées.
              </p>
            )}
          </div>
          <div className="space-y-4">
            {data.affairs.map((affair) => (
              <div key={affair.id}>
                <p className="mb-2 text-sm font-semibold text-muted-foreground">
                  Candidat ou personnalité suivie :{" "}
                  <Link
                    href={`/politiques/${affair.politician.slug}`}
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    {affair.politician.fullName}
                  </Link>
                </p>
                <AffairListingCard affair={affair} />
              </div>
            ))}
          </div>
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
    </main>
  );
}
