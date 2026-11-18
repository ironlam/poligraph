import type { Metadata } from "next";
import Link from "next/link";
import { toCSV } from "@/lib/csv";
import {
  getDepartementExportRows,
  getRegionExportRows,
  getTerritoireReleases,
} from "@/lib/data/territoires-exports";
import { DEPARTEMENT_COLUMNS, REGION_COLUMNS } from "@/lib/territoires/exports";
import { TERRITOIRES_DONNEES_PATH, TERRITOIRES_PATH } from "@/lib/territoires/paths";
import { SITE_URL } from "@/config/site";
import { BreadcrumbJsonLd } from "@/components/seo/JsonLd";
import {
  DonneesFichiers,
  DonneesFormat,
  DonneesLicence,
  DonneesParDepartement,
  DonneesReleases,
  DonneesSources,
  type DownloadFile,
} from "@/components/territoires/DonneesSections";
import { openGraph } from "@/lib/seo/open-graph";
import { TERRITOIRES_OG_IMAGE } from "@/lib/territoires/og-image";

/*
 * Indexable: the page carries the licence register and the column documentation, real content
 * of its own (AGENTS.md §5). The CSV files it links to live under /api and stay noindex.
 */

const DESCRIPTION =
  "Communes, départements et régions en CSV, avec la licence de chaque source reprise. Fichier national daté, fichiers par département, colonnes documentées.";

export const metadata: Metadata = {
  title: "Données des territoires : fichiers CSV et licences",
  description: DESCRIPTION,
  alternates: { canonical: TERRITOIRES_DONNEES_PATH },
  openGraph: openGraph({
    title: "Données des territoires : fichiers CSV et licences",
    description: DESCRIPTION,
    url: TERRITOIRES_DONNEES_PATH,
    images: [TERRITOIRES_OG_IMAGE],
  }),
};

/** BOM included, as served by the export routes. */
function csvBytes<T extends Record<string, unknown>>(
  rows: T[],
  columns: { key: keyof T; header: string }[]
): number {
  return new TextEncoder().encode("﻿" + toCSV(rows, columns, { neutralizeFormulas: true })).length;
}

export default async function TerritoiresDonneesPage() {
  const releases = await getTerritoireReleases();
  const departements = await getDepartementExportRows();
  const regions = await getRegionExportRows();

  const files: DownloadFile[] = [
    {
      label: "Départements et collectivités d'outre-mer",
      href: "/api/export/territoires/departements",
      rows: departements.length,
      bytes: csvBytes(departements, DEPARTEMENT_COLUMNS),
    },
    {
      label: "Régions",
      href: "/api/export/territoires/regions",
      rows: regions.length,
      bytes: csvBytes(regions, REGION_COLUMNS),
    },
  ];

  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: "Accueil", url: SITE_URL },
          { name: "Territoires", url: `${SITE_URL}${TERRITOIRES_PATH}` },
          { name: "Données", url: `${SITE_URL}${TERRITOIRES_DONNEES_PATH}` },
        ]}
      />
      <div className="container mx-auto max-w-3xl space-y-6 px-4 py-8 sm:py-10">
        <header>
          <p className="text-sm">
            <Link
              href={TERRITOIRES_PATH}
              prefetch={false}
              className="inline-flex min-h-11 items-center underline underline-offset-4"
            >
              Territoires
            </Link>
          </p>
          <h1 className="font-display text-3xl font-extrabold sm:text-4xl">
            Données des territoires
          </h1>
          <p className="mt-2 text-base">
            Communes, départements et régions en CSV, téléchargeables sans compte. Chaque donnée
            reprise garde sa source et sa licence, listées en bas de page.
          </p>
        </header>
        <DonneesReleases releases={releases} />
        <DonneesParDepartement departements={departements} />
        <DonneesFichiers files={files} />
        <DonneesLicence />
        <DonneesFormat />
        <DonneesSources />
      </div>
    </>
  );
}
