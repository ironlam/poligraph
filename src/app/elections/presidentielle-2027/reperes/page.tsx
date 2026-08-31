import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { CollectionPageJsonLd, DefinedTermSetJsonLd } from "@/components/seo/JsonLd";
import { SITE_URL } from "@/config/site";
import { getPresidentialReaderGuideIndex } from "@/lib/data/presidential-reader-guides";
import {
  presidentialReaderGuidePath,
  presidentialReaderGuidesPath,
} from "@/lib/presidentielle/reader-guide-paths";
import { PRESIDENTIELLE_2027_SLUG } from "@/lib/presidentielle/themes";

export const revalidate = 86400;

const PAGE_PATH = presidentialReaderGuidesPath();

export async function generateMetadata(): Promise<Metadata> {
  const guides = await getPresidentialReaderGuideIndex(PRESIDENTIELLE_2027_SLUG);
  return {
    title: "Glossaire des programmes et mesures | Présidentielle 2027",
    description:
      "Comprendre les sigles, dispositifs et notions techniques cités dans les mesures de la présidentielle 2027, avec des définitions sourcées.",
    robots: guides.some((guide) => guide.indexable) ? undefined : { index: false, follow: true },
    alternates: { canonical: PAGE_PATH },
  };
}

export default async function PresidentialReaderGuidesPage() {
  const guides = await getPresidentialReaderGuideIndex(PRESIDENTIELLE_2027_SLUG);
  const indexableGuides = guides.filter((guide) => guide.indexable);

  return (
    <main className="pb-14">
      <CollectionPageJsonLd
        name="Glossaire des programmes de la présidentielle 2027"
        description="Définitions sourcées des sigles, dispositifs et notions techniques présents dans les mesures publiées."
        url={`${SITE_URL}${PAGE_PATH}`}
        numberOfItems={indexableGuides.length}
      />
      <DefinedTermSetJsonLd
        name="Repères pour comprendre les programmes de la présidentielle 2027"
        description="Définitions sourcées des termes techniques réellement présents dans le corpus public."
        url={`${SITE_URL}${PAGE_PATH}`}
        terms={indexableGuides.map((guide) => ({
          name: guide.label,
          url: `${SITE_URL}${presidentialReaderGuidePath(guide.slug)}`,
        }))}
      />
      <Breadcrumb
        items={[
          { label: "Élections", href: "/elections" },
          { label: "Présidentielle 2027", href: "/elections/presidentielle-2027" },
          { label: "Repères pour comprendre" },
        ]}
      />

      <div className="container mx-auto max-w-6xl px-4">
        <header className="max-w-3xl space-y-3 py-4">
          <p className="text-xs font-bold uppercase tracking-widest text-brand-on-surface">
            Présidentielle 2027
          </p>
          <h1 className="font-display text-3xl font-extrabold leading-tight tracking-tight md:text-5xl">
            Comprendre les termes des programmes
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground md:text-lg">
            Ce glossaire explique les sigles, dispositifs publics et notions techniques réellement
            cités dans les mesures publiées. Chaque définition est relue, sourcée et reliée aux
            propositions concernées.
          </p>
        </header>

        {guides.length === 0 ? (
          <section className="mt-6 rounded-2xl border border-border bg-card p-6">
            <h2 className="font-display text-xl font-bold">Le glossaire est en préparation</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Les premiers repères seront affichés après validation de leur définition et de leur
              rattachement à une mesure publique.
            </p>
          </section>
        ) : (
          <ul className="mt-8 grid gap-4 md:grid-cols-2">
            {guides.map((guide) => (
              <li key={guide.slug}>
                <article className="flex h-full flex-col rounded-2xl border border-border bg-card p-5">
                  <h2 className="font-display text-xl font-bold">{guide.label}</h2>
                  <p className="mt-3 flex-1 text-sm leading-relaxed text-foreground">
                    {guide.definition}
                  </p>
                  <p className="mt-4 text-xs text-muted-foreground-strong">
                    {guide.measures.length} {guide.measures.length === 1 ? "mesure" : "mesures"} ·{" "}
                    {guide.candidateCount} {guide.candidateCount === 1 ? "candidat" : "candidats"}
                  </p>
                  <ul
                    aria-label={`Thèmes liés à ${guide.label}`}
                    className="mt-2 flex flex-wrap gap-2"
                  >
                    {guide.themes.map((theme) => (
                      <li key={theme.theme}>
                        <Link
                          href={`/elections/presidentielle-2027/themes/${theme.slug}`}
                          className="inline-flex min-h-11 items-center rounded-full border border-border px-3 py-2 text-xs font-semibold hover:border-primary hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                        >
                          {theme.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                  <Link
                    href={presidentialReaderGuidePath(guide.slug)}
                    className="mt-3 inline-flex min-h-11 items-center gap-2 self-start font-bold text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  >
                    Voir la définition et les mesures
                    <ArrowRight aria-hidden="true" className="h-4 w-4" />
                  </Link>
                </article>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
