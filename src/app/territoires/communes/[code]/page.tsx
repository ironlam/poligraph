import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SITE_URL } from "@/config/site";
import { AdministrativeAreaJsonLd } from "@/components/seo/JsonLd";
import { CommuneHero } from "@/components/territoires/CommuneHero";
import {
  CommuneSidebar,
  ElectionsSection,
  ParlementSection,
  QuiDecideSection,
} from "@/components/territoires/CommuneSections";
import { getCommuneDossier } from "@/lib/data/territoires";
import { missingEntityMetadata } from "@/lib/seo/not-found-metadata";
import { territoireCommuneRobotsMetadata } from "@/lib/seo/territoire-robots";
import { communeDescription, communeTitle } from "@/lib/territoires/commune-display";
import {
  territoireCommuneDecisionsPath,
  territoireCommunePath,
  territoireDepartementPath,
} from "@/lib/territoires/paths";

// ISR: 24 h backstop; freshness comes from the reader's cache tags.
export const revalidate = 86400;

/** Never prerender the 35 000 communes at build time: every page is rendered on first visit. */
export function generateStaticParams() {
  return [];
}

interface PageProps {
  params: Promise<{ code: string }>;
}

const loadDossier = cache((code: string) => getCommuneDossier(code));

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { code } = await params;
  const dossier = await loadDossier(code);
  if (!dossier) return missingEntityMetadata("Commune introuvable");

  const title = communeTitle(dossier);
  const description = communeDescription(dossier);
  return {
    title,
    description,
    ...territoireCommuneRobotsMetadata({
      population: dossier.population.value,
      maireEtabli: dossier.maire.state === "ETABLI",
    }),
    openGraph: { title, description },
    alternates: { canonical: territoireCommunePath(dossier.identity.inseeCode) },
  };
}

const ANCHORS = [
  { href: "#qui-decide", label: "Élus et institutions" },
  { href: "#elections", label: "Élections" },
  { href: "#sources", label: "Sources et réutilisation" },
];

export default async function TerritoireCommunePage({ params }: PageProps) {
  const { code } = await params;
  const dossier = await loadDossier(code);
  if (!dossier) notFound();

  const { identity } = dossier;
  // No link to the decisions while none is published (plan §7).
  const anchors =
    dossier.decisionsPubliees > 0
      ? [
          ...ANCHORS,
          { href: territoireCommuneDecisionsPath(identity.inseeCode), label: "Décisions" },
        ]
      : ANCHORS;
  const departmentName = identity.department.name ?? identity.territoireHorsRegion?.name ?? null;

  return (
    <>
      <AdministrativeAreaJsonLd
        name={identity.name}
        url={`${SITE_URL}${territoireCommunePath(identity.inseeCode)}`}
        identifier={{ propertyID: "Code INSEE", value: identity.inseeCode }}
        containedInPlace={
          departmentName
            ? {
                name: departmentName,
                ...(identity.department.slug && {
                  url: `${SITE_URL}${territoireDepartementPath(identity.department.slug)}`,
                }),
              }
            : undefined
        }
      />
      <CommuneHero dossier={dossier} />

      <div className="container mx-auto max-w-6xl px-4 py-6 md:py-8">
        <nav aria-label="Sections de la page" className="mb-6">
          <ul className="flex flex-wrap gap-2">
            {anchors.map((a) => (
              <li key={a.href}>
                <a
                  href={a.href}
                  className="inline-flex min-h-11 items-center rounded-full border border-primary/30 bg-card px-4 text-sm font-medium text-primary hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  {a.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="min-w-0 space-y-6">
            <QuiDecideSection dossier={dossier} />
            <ParlementSection dossier={dossier} />
            <ElectionsSection dossier={dossier} />
          </div>
          <CommuneSidebar dossier={dossier} />
        </div>
      </div>
    </>
  );
}
