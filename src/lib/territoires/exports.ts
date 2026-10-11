import { DATA_SOURCE_LABELS } from "@/config/labels";
import { COMMUNE_POPULATION_SOURCE } from "@/config/communes";
import { DEPARTMENTS, getDepartmentName, getDepartmentSlug } from "@/config/departments";
import {
  REGIONS,
  TERRITOIRES_HORS_REGION,
  TERRITOIRES_SANS_COMMUNE,
  getRegionForDepartment,
} from "@/config/regions";
import { SITE_URL } from "@/config/site";
import type { DataSource } from "@/generated/prisma";
import {
  territoireCommunePath,
  territoireRegionPath,
  territoireDepartementPath,
} from "@/lib/territoires/paths";

/**
 * CSV exports of the Territoires section (#1052, lot 3.2). Pure: rows in, rows out. The readers
 * live in `export-query.ts` (shared by the routes and the release script), the routes in
 * `src/app/api/export/territoires/`.
 *
 * Same facts and the same rules as the pages: a mayor is named only when exactly one current
 * holder exists and their profile is public; otherwise the row says « NON_ETABLI » and carries no
 * name. An absence stays an empty cell, never a zero.
 */

/**
 * Departments and overseas territories for which a commune file exists: the closed list a route
 * parameter is checked against. TAAF (984) and Clipperton (989) are left out: they have no
 * commune, and the pages never present their districts as communes.
 */
export const EXPORT_DEPARTMENT_CODES: readonly string[] = [
  ...Object.keys(DEPARTMENTS),
  ...Object.keys(TERRITOIRES_HORS_REGION),
]
  .filter((code, i, all) => all.indexOf(code) === i && !TERRITOIRES_SANS_COMMUNE.has(code))
  .sort();

const EXPORT_DEPARTMENT_SET = new Set(EXPORT_DEPARTMENT_CODES);

/** "2a" -> "2A". Null for anything outside the closed list. */
export function parseExportDepartmentCode(raw: string): string | null {
  const code = raw.trim().toUpperCase();
  return EXPORT_DEPARTMENT_SET.has(code) ? code : null;
}

export type MaireExportState = "ETABLI" | "NON_ETABLI" | "ABSENT";

export interface MaireHolder {
  slug: string;
  fullName: string;
  publicId: string | null;
  publicationStatus: string;
  lastConfirmedAt: Date | null;
  source: DataSource | null;
}

/**
 * Same rule as `resolveTitulaire` in `src/lib/data/territoires.ts` (not importable from a
 * script, that module is server-only): holders are counted before the public filter, several
 * holders or a single non-public one give NON_ETABLI, without a name or a reason.
 */
export function resolveMaire(holders: readonly MaireHolder[]): {
  state: MaireExportState;
  holder: MaireHolder | null;
} {
  if (holders.length === 0) return { state: "ABSENT", holder: null };
  const only = holders[0]!;
  if (holders.length > 1 || only.publicationStatus !== "PUBLISHED") {
    return { state: "NON_ETABLI", holder: null };
  }
  return { state: "ETABLI", holder: only };
}

/** Same set as `PLM_COMMUNES` in `src/lib/data/territoires.ts`. */
const PLM_COMMUNES = new Set(["75056", "69123", "13055"]);

function isoDay(date: Date | null | undefined): string {
  return date ? date.toISOString().slice(0, 10) : "";
}

// ─── Communes ───────────────────────────────────────────────────

export interface CommuneExportInput {
  id: string;
  name: string;
  departmentCode: string;
  regionCode: string | null;
  regionName: string | null;
  population: number | null;
  constituencyNumber: number | null;
}

export interface CommuneExportRow extends Record<string, unknown> {
  code_insee: string;
  nom: string;
  code_departement: string;
  departement: string;
  code_region: string;
  region: string;
  population: number | null;
  population_source: string;
  maire_etat: MaireExportState;
  maire_nom: string;
  maire_poligraph_id: string;
  maire_url: string;
  maire_source: string;
  maire_confirme_le: string;
  circonscription_enregistree: number | null;
  circonscription_couverture: string;
  url_page: string;
  communes_importees_le: string;
}

export const COMMUNE_COLUMNS: { key: keyof CommuneExportRow; header: string }[] = [
  { key: "code_insee", header: "code_insee" },
  { key: "nom", header: "nom" },
  { key: "code_departement", header: "code_departement" },
  { key: "departement", header: "departement" },
  { key: "code_region", header: "code_region" },
  { key: "region", header: "region" },
  { key: "population", header: "population" },
  { key: "population_source", header: "population_source" },
  { key: "maire_etat", header: "maire_etat" },
  { key: "maire_nom", header: "maire_nom" },
  { key: "maire_poligraph_id", header: "maire_poligraph_id" },
  { key: "maire_url", header: "maire_url" },
  { key: "maire_source", header: "maire_source" },
  { key: "maire_confirme_le", header: "maire_confirme_le" },
  { key: "circonscription_enregistree", header: "circonscription_enregistree" },
  { key: "circonscription_couverture", header: "circonscription_couverture" },
  { key: "url_page", header: "url_page" },
  { key: "communes_importees_le", header: "communes_importees_le" },
];

const POPULATION_SOURCE_LABEL = `${COMMUNE_POPULATION_SOURCE.label}, via ${COMMUNE_POPULATION_SOURCE.via}`;

export function communeRow(
  commune: CommuneExportInput,
  holders: readonly MaireHolder[],
  importedAt: Date | null
): CommuneExportRow {
  const { state, holder } = resolveMaire(holders);
  const region = getRegionForDepartment(commune.departmentCode);
  const horsRegion = TERRITOIRES_HORS_REGION[commune.departmentCode];
  const plm = PLM_COMMUNES.has(commune.id);
  const circo = plm ? null : commune.constituencyNumber;

  return {
    code_insee: commune.id,
    nom: commune.name,
    code_departement: commune.departmentCode,
    departement:
      getDepartmentName(commune.departmentCode) ?? horsRegion?.name ?? commune.departmentCode,
    // The region comes from the COG referential, as on the pages: a COM belongs to none.
    code_region: region?.code ?? "",
    region: region?.name ?? "",
    population: commune.population,
    population_source: commune.population != null ? POPULATION_SOURCE_LABEL : "",
    maire_etat: state,
    maire_nom: holder?.fullName ?? "",
    maire_poligraph_id: holder?.publicId ?? "",
    maire_url: holder ? `${SITE_URL}/politiques/${holder.slug}` : "",
    maire_source: holder?.source ? DATA_SOURCE_LABELS[holder.source] : "",
    maire_confirme_le: isoDay(holder?.lastConfirmedAt),
    circonscription_enregistree: circo,
    circonscription_couverture: plm ? "PLUSIEURS" : circo != null ? "NON_VERIFIEE" : "",
    url_page: `${SITE_URL}${territoireCommunePath(commune.id)}`,
    communes_importees_le: isoDay(importedAt),
  };
}

// ─── Departments ────────────────────────────────────────────────

export interface DepartementExportRow extends Record<string, unknown> {
  code: string;
  nom: string;
  statut: string;
  code_region: string;
  region: string;
  communes_en_base: number;
  deputes_en_fonction: number;
  senateurs_en_fonction: number;
  url_page: string;
  fichier_communes: string;
}

export const DEPARTEMENT_COLUMNS: { key: keyof DepartementExportRow; header: string }[] = [
  { key: "code", header: "code" },
  { key: "nom", header: "nom" },
  { key: "statut", header: "statut" },
  { key: "code_region", header: "code_region" },
  { key: "region", header: "region" },
  { key: "communes_en_base", header: "communes_en_base" },
  { key: "deputes_en_fonction", header: "deputes_en_fonction" },
  { key: "senateurs_en_fonction", header: "senateurs_en_fonction" },
  { key: "url_page", header: "url_page" },
  { key: "fichier_communes", header: "fichier_communes" },
];

export interface DepartementCounts {
  communes: ReadonlyMap<string, number>;
  deputes: ReadonlyMap<string, number>;
  senateurs: ReadonlyMap<string, number>;
}

export function communesExportPath(departmentCode: string): string {
  return `/api/export/territoires/communes/${encodeURIComponent(departmentCode)}`;
}

/** Every department and overseas territory, TAAF and Clipperton included, sorted by code. */
export function departementRows(counts: DepartementCounts): DepartementExportRow[] {
  const codes = [
    ...new Set([...Object.keys(DEPARTMENTS), ...Object.keys(TERRITOIRES_HORS_REGION)]),
  ].sort();
  return codes.map((code) => {
    const region = getRegionForDepartment(code);
    const horsRegion = TERRITOIRES_HORS_REGION[code];
    const name = getDepartmentName(code) ?? horsRegion?.name ?? code;
    const slug = DEPARTMENTS[code] ? getDepartmentSlug(DEPARTMENTS[code].name) : null;
    return {
      code,
      nom: name,
      statut: horsRegion?.statut ?? (region?.outreMer ? "Département d'outre-mer" : "Département"),
      code_region: region?.code ?? "",
      region: region?.name ?? "",
      communes_en_base: counts.communes.get(code) ?? 0,
      deputes_en_fonction: counts.deputes.get(code) ?? 0,
      senateurs_en_fonction: counts.senateurs.get(code) ?? 0,
      url_page: slug ? `${SITE_URL}${territoireDepartementPath(slug)}` : "",
      fichier_communes: EXPORT_DEPARTMENT_SET.has(code)
        ? `${SITE_URL}${communesExportPath(code)}`
        : "",
    };
  });
}

// ─── Regions ────────────────────────────────────────────────────

export interface RegionExportRow extends Record<string, unknown> {
  code: string;
  nom: string;
  outre_mer: string;
  codes_departements: string;
  chef_lieu_code_insee: string;
  chef_lieu: string;
  communes_en_base: number;
  url_page: string;
}

export const REGION_COLUMNS: { key: keyof RegionExportRow; header: string }[] = [
  { key: "code", header: "code" },
  { key: "nom", header: "nom" },
  { key: "outre_mer", header: "outre_mer" },
  { key: "codes_departements", header: "codes_departements" },
  { key: "chef_lieu_code_insee", header: "chef_lieu_code_insee" },
  { key: "chef_lieu", header: "chef_lieu" },
  { key: "communes_en_base", header: "communes_en_base" },
  { key: "url_page", header: "url_page" },
];

export function regionRows(communesByDepartment: ReadonlyMap<string, number>): RegionExportRow[] {
  return [...REGIONS]
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((r) => ({
      code: r.code,
      nom: r.name,
      outre_mer: r.outreMer ? "oui" : "non",
      // Semicolon inside the cell: the file separator is the comma.
      codes_departements: r.departmentCodes.join(";"),
      chef_lieu_code_insee: r.chefLieu.inseeCode,
      chef_lieu: r.chefLieu.name,
      communes_en_base: r.departmentCodes.reduce(
        (n, code) => n + (communesByDepartment.get(code) ?? 0),
        0
      ),
      url_page: `${SITE_URL}${territoireRegionPath(r.slug)}`,
    }));
}

// ─── Releases ───────────────────────────────────────────────────

/** `SyncMetadata.sourceKey` prefix of the national releases, one row per published file. */
export const RELEASE_KEY_PREFIX = "territoires-release:communes:";

/** "communes-france-2026-10-11.csv": dated, never overwritten. */
export function releaseFileName(day: string): string {
  return `communes-france-${day}.csv`;
}

export const RELEASE_BLOB_PREFIX = "territoires/releases/";
