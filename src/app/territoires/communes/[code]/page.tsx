import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SITE_URL } from "@/config/site";
import { aUneMairie } from "@/config/territoires-agir";
import { AdministrativeAreaJsonLd } from "@/components/seo/JsonLd";
import { Agir } from "@/components/territoires/Agir";
import { CommuneBandeau } from "@/components/territoires/CommuneBandeau";
import { EchelleTerritoires } from "@/components/territoires/EchelleTerritoires";
import { TerritoireOnglets } from "@/components/territoires/TerritoireOnglets";
import { VotesParlementaires, type VotesMode } from "@/components/territoires/VotesParlementaires";
import { getVotesDeputesDepartement } from "@/lib/data/territoire-votes";
import { echelleCommune } from "@/lib/territoires/echelle";
import {
  CommuneSidebar,
  ElectionsSection,
  ParlementSection,
  QuiDecideSection,
} from "@/components/territoires/CommuneSections";
import { getCommuneDossier } from "@/lib/data/territoires";
import { getCommuneElections } from "@/lib/data/territoire-elections";
import { getCommuneChiffres } from "@/lib/data/territoire-chiffres";
import { hasChiffres, TerritoireChiffres } from "@/components/territoires/TerritoireChiffres";
import { communeScrutins } from "@/lib/territoires/commune-elections";
import { missingEntityMetadata } from "@/lib/seo/not-found-metadata";
import { territoireCommuneRobotsMetadata } from "@/lib/seo/territoire-robots";
import { communeDescription, communeTitle } from "@/lib/territoires/commune-display";
import { territoireCommunePath, territoireDepartementPath } from "@/lib/territoires/paths";

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

export default async function TerritoireCommunePage({ params }: PageProps) {
  const { code } = await params;
  const dossier = await loadDossier(code);
  if (!dossier) notFound();

  const { identity } = dossier;
  // The dossier knows 2026 and the presidential only: the earlier municipales come from the
  // elections reader, so the count and the lines match the dedicated page.
  const [elections, chiffres, votes] = await Promise.all([
    getCommuneElections(identity.inseeCode),
    getCommuneChiffres(identity.inseeCode),
    getVotesDeputesDepartement(identity.department.code),
  ]);
  // A name only when the base establishes one deputy for the commune; otherwise no name.
  const { deputes } = dossier.parlement;
  const depute =
    deputes.couvertureCirconscriptions !== "PLUSIEURS" && deputes.state === "DISPONIBLE"
      ? deputes.deputes[0]
      : undefined;
  const votesMode: VotesMode = depute
    ? { kind: "depute", depute: { slug: depute.slug, fullName: depute.fullName } }
    : { kind: "renvoi" };
  const scrutins = elections?.scrutins ?? communeScrutins(dossier.elections, identity.inseeCode);
  // One word each, five at most: the tabs share one line on a phone. Sub-pages are linked from
  // their own section.
  const onglets = [
    { href: "#vos-elus", label: "Élus" },
    { href: "#parlement", label: "Parlement" },
    ...(hasChiffres(chiffres) ? [{ href: "#chiffres", label: "Chiffres" }] : []),
    { href: "#elections", label: "Élections" },
    ...(aUneMairie(identity.department.code) ? [{ href: "#agir", label: "Agir" }] : []),
  ];
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
      <CommuneBandeau dossier={dossier} />
      <TerritoireOnglets onglets={onglets} />

      <div className="container mx-auto max-w-6xl px-4 py-6 md:py-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="min-w-0 space-y-6">
            <QuiDecideSection dossier={dossier} />
            <ParlementSection dossier={dossier} />
            <VotesParlementaires votes={votes} mode={votesMode} />
            {hasChiffres(chiffres) && <TerritoireChiffres chiffres={chiffres} />}
            <ElectionsSection dossier={dossier} scrutins={scrutins} />
            <Agir departmentCode={identity.department.code} />
          </div>
          <div className="space-y-4">
            <EchelleTerritoires barreaux={echelleCommune(dossier)} />
            <CommuneSidebar dossier={dossier} />
          </div>
        </div>
      </div>
    </>
  );
}
