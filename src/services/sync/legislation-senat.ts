/**
 * Senate legislation sync service
 *
 * Downloads CSV data from data.gouv.fr (PPL propositions + rapports),
 * parses author names, matches to existing LegislativeDossier records
 * via senatUrl or title, resolves senators via ExternalId or resolveBatch,
 * and creates DossierAuthor records.
 */

import { db } from "@/lib/db";
import { DataSource, Chamber, DossierActorRole, MandateType } from "@/generated/prisma";
import { parse } from "csv-parse/sync";
import { resolveBatch } from "@/lib/identity";
import { IDENTITY_THRESHOLDS } from "@/lib/identity";
import type { ResolveInput } from "@/lib/identity";
import { normalizeText } from "@/lib/name-matching";
import { USER_AGENT } from "@/config/site";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Direct download URLs for Senate DOSLEG CSVs */
const PPL_CSV_URL = "https://data.senat.fr/data/dosleg/ppl.csv";
const RAPPORTS_CSV_URL = "https://data.senat.fr/data/dosleg/rapports.csv";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SenatSyncResult {
  ppl: {
    rowsParsed: number;
    dossiersMatched: number;
    authorsCreated: number;
    authorsSkipped: number;
    errors: string[];
  };
  rapports: {
    rowsParsed: number;
    dossiersMatched: number;
    authorsCreated: number;
    authorsSkipped: number;
    errors: string[];
  };
  resolution: {
    senatIdMatched: number;
    batchMatched: number;
    notResolved: number;
  };
}

interface ParsedAuthor {
  firstName: string;
  lastName: string;
}

interface PplRow {
  Session?: string;
  Auteurs?: string;
  Titre?: string;
  "URL du dossier"?: string;
  [key: string]: string | undefined;
}

interface RapportRow {
  Auteurs?: string;
  Organismes?: string;
  "Titre court"?: string;
  "Titre long"?: string;
  URL?: string;
  "Type de rapport"?: string;
  [key: string]: string | undefined;
}

// ---------------------------------------------------------------------------
// URL normalization
// ---------------------------------------------------------------------------

/**
 * Normalize a senat.fr dossier URL for comparison.
 * Strips protocol, .html extension, trailing slash, lowercases.
 */
function normalizeSenatUrl(url: string): string {
  return url
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\.html$/, "")
    .replace(/\/$/, "");
}

// ---------------------------------------------------------------------------
// Name parsing
// ---------------------------------------------------------------------------

/**
 * Parse author names from Senate CSV format: "Prenom NOM, Prenom2 NOM2"
 * UPPERCASE words from the end are treated as the last name.
 */
function parseAuthorNames(raw: string): ParsedAuthor[] {
  if (!raw || !raw.trim()) return [];

  return raw
    .split(",")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
    .map((segment) => parseOneName(segment))
    .filter((a): a is ParsedAuthor => a !== null);
}

function parseOneName(segment: string): ParsedAuthor | null {
  const words = segment.split(/\s+/).filter((w) => w.length > 0);
  if (words.length < 2) return null;

  // Detect UPPERCASE words from the end as lastName
  const lastNameParts: string[] = [];
  let i = words.length - 1;
  while (i >= 1) {
    const word = words[i]!;
    // Check if the word is fully uppercase (letters only) or a particle like "de", "le"
    if (isUpperCase(word)) {
      lastNameParts.unshift(word);
      i--;
    } else if (
      lastNameParts.length > 0 &&
      ["de", "du", "des", "le", "la", "d'"].includes(word.toLowerCase())
    ) {
      // Particle before uppercase surname
      lastNameParts.unshift(word);
      i--;
    } else {
      break;
    }
  }

  if (lastNameParts.length === 0) return null;

  const firstNameParts = words.slice(0, i + 1);
  if (firstNameParts.length === 0) return null;

  // Title-case the names for consistency
  const firstName = firstNameParts.map(titleCase).join(" ");
  const lastName = lastNameParts.map(titleCase).join(" ");

  return { firstName, lastName };
}

function isUpperCase(word: string): boolean {
  // Strip accented chars for the check, but the word must have at least one letter
  const letters = word.replace(/[^a-zA-ZÀ-ÿ]/g, "");
  if (letters.length === 0) return false;
  return letters === letters.toUpperCase() && letters !== letters.toLowerCase();
}

function titleCase(word: string): string {
  if (word.length === 0) return word;
  // Handle particles: keep them lowercase
  if (["de", "du", "des", "le", "la", "l'", "d'"].includes(word.toLowerCase())) {
    return word.toLowerCase();
  }
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

// ---------------------------------------------------------------------------
// Title normalization for fallback matching
// ---------------------------------------------------------------------------

/**
 * Normalize a dossier title for fuzzy matching.
 * Strips common prefixes and lowercases.
 */
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^(projet|proposition)\s+de\s+loi\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// CSV download helpers
// ---------------------------------------------------------------------------

/**
 * Download a CSV file and return raw buffer.
 */
async function downloadCsvBuffer(url: string): Promise<Buffer> {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Parse a CSV buffer encoded as ISO-8859-1 with semicolon delimiters.
 */
function parseCsv<T extends Record<string, string | undefined>>(buf: Buffer): T[] {
  const text = buf.toString("latin1");
  return parse(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    delimiter: ";",
    relax_quotes: true,
    relax_column_count: true,
  }) as T[];
}

// ---------------------------------------------------------------------------
// Dossier matching
// ---------------------------------------------------------------------------

interface DossierLookup {
  urlMap: Map<string, string>; // normalizedSenatUrl -> dossierId
  titleMap: Map<string, string>; // normalizedTitle -> dossierId (fallback)
}

/**
 * Build lookup maps from existing dossiers for matching.
 */
async function buildDossierLookup(): Promise<DossierLookup> {
  const dossiers = await db.legislativeDossier.findMany({
    select: { id: true, senatUrl: true, title: true },
  });

  const urlMap = new Map<string, string>();
  const titleMap = new Map<string, string>();

  for (const d of dossiers) {
    if (d.senatUrl) {
      urlMap.set(normalizeSenatUrl(d.senatUrl), d.id);
    }
    titleMap.set(normalizeTitle(d.title), d.id);
  }

  return { urlMap, titleMap };
}

/**
 * Find a dossier ID by URL first, then title fallback.
 */
function findDossier(
  lookup: DossierLookup,
  url: string | undefined,
  title: string | undefined
): string | null {
  if (url) {
    const dossierId = lookup.urlMap.get(normalizeSenatUrl(url));
    if (dossierId) return dossierId;
  }
  if (title) {
    const dossierId = lookup.titleMap.get(normalizeTitle(title));
    if (dossierId) return dossierId;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Senator resolution
// ---------------------------------------------------------------------------

/**
 * Cache of firstName+lastName -> politicianId for senators.
 * Avoids repeated DB lookups for the same senator across rows.
 */
type SenatorCache = Map<string, string | null>;

function senatorCacheKey(firstName: string, lastName: string): string {
  return `${normalizeText(firstName)}::${normalizeText(lastName)}`;
}

/**
 * Look up a senator by name in the ExternalId table (SENAT source).
 * Performs a case-insensitive search on linked Politician names.
 */
async function lookupSenatorByExternalId(
  firstName: string,
  lastName: string,
  cache: SenatorCache
): Promise<string | null> {
  const key = senatorCacheKey(firstName, lastName);

  if (cache.has(key)) {
    return cache.get(key) ?? null;
  }

  // Search for a politician linked via SENAT ExternalId, matching by name
  const match = await db.externalId.findFirst({
    where: {
      source: DataSource.SENAT,
      politicianId: { not: null },
      politician: {
        lastName: { equals: lastName, mode: "insensitive" },
        firstName: { equals: firstName, mode: "insensitive" },
      },
    },
    select: { politicianId: true },
  });

  const result = match?.politicianId ?? null;
  cache.set(key, result);
  return result;
}

/**
 * Resolve authors that could not be matched via ExternalId,
 * using the batch identity resolver as a fallback.
 */
async function resolveUnmatchedAuthors(
  unmatched: Array<{ firstName: string; lastName: string; rowKey: string }>,
  cache: SenatorCache,
  stats: SenatSyncResult["resolution"]
): Promise<void> {
  if (unmatched.length === 0) return;

  // Deduplicate by name to avoid redundant resolution
  const uniqueByKey = new Map<string, { firstName: string; lastName: string; rowKey: string }>();
  for (const entry of unmatched) {
    const key = senatorCacheKey(entry.firstName, entry.lastName);
    if (!uniqueByKey.has(key)) {
      uniqueByKey.set(key, entry);
    }
  }

  const inputs: ResolveInput[] = Array.from(uniqueByKey.values()).map((entry) => ({
    firstName: entry.firstName,
    lastName: entry.lastName,
    source: DataSource.SENAT,
    sourceId: `senat-author-${entry.rowKey}`,
    mandateType: MandateType.SENATEUR,
  }));

  const batchResult = await resolveBatch({
    inputs,
    sourceType: DataSource.SENAT,
  });

  for (const result of batchResult.results) {
    if (result.politicianId && result.confidence >= IDENTITY_THRESHOLDS.AUTO_MATCH) {
      // Extract name from the sourceId to rebuild the cache key
      const input = inputs.find((i) => i.sourceId === result.sourceId);
      if (input) {
        const key = senatorCacheKey(input.firstName, input.lastName);
        cache.set(key, result.politicianId);
        stats.batchMatched++;
      }
    } else {
      stats.notResolved++;
    }
  }
}

// ---------------------------------------------------------------------------
// Phase processors
// ---------------------------------------------------------------------------

/**
 * Process the PPL CSV: link proposition authors to dossiers.
 */
async function processPplPhase(
  lookup: DossierLookup,
  cache: SenatorCache,
  stats: SenatSyncResult
): Promise<void> {
  console.log("Phase 1: Downloading PPL CSV...");
  const buf = await downloadCsvBuffer(PPL_CSV_URL);
  const rows = parseCsv<PplRow>(buf);
  stats.ppl.rowsParsed = rows.length;
  console.log(`  Parsed ${rows.length} PPL rows`);

  // Collect unmatched authors for batch resolution
  const unmatchedAuthors: Array<{
    firstName: string;
    lastName: string;
    rowKey: string;
    dossierId: string;
    role: DossierActorRole;
  }> = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    try {
      const dossierId = findDossier(lookup, row["URL du dossier"], row["Titre"]);
      if (!dossierId) continue;
      stats.ppl.dossiersMatched++;

      const authors = parseAuthorNames(row["Auteurs"] ?? "");
      for (let j = 0; j < authors.length; j++) {
        const author = authors[j]!;
        // First 2 names in CSV = depositors (AUTEUR), rest = cosignataires
        const role = j < 2 ? DossierActorRole.AUTEUR : DossierActorRole.COSIGNATAIRE;
        const politicianId = await lookupSenatorByExternalId(
          author.firstName,
          author.lastName,
          cache
        );
        if (politicianId) {
          stats.resolution.senatIdMatched++;
          await upsertDossierAuthor(dossierId, politicianId, role, Chamber.SENAT, null, stats.ppl);
        } else {
          unmatchedAuthors.push({
            ...author,
            rowKey: `ppl-${i}`,
            dossierId,
            role,
          });
        }
      }
    } catch (err) {
      stats.ppl.errors.push(
        `PPL row ${i + 1}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // Batch resolve unmatched authors
  if (unmatchedAuthors.length > 0) {
    console.log(`  Resolving ${unmatchedAuthors.length} unmatched PPL authors via batch...`);
    await resolveUnmatchedAuthors(unmatchedAuthors, cache, stats.resolution);

    // Re-process unmatched authors that are now resolved
    for (const entry of unmatchedAuthors) {
      const key = senatorCacheKey(entry.firstName, entry.lastName);
      const politicianId = cache.get(key);
      if (politicianId) {
        await upsertDossierAuthor(
          entry.dossierId,
          politicianId,
          entry.role,
          Chamber.SENAT,
          null,
          stats.ppl
        );
      }
    }
  }
}

/**
 * Process the Rapports CSV: link rapporteurs to dossiers.
 */
async function processRapportsPhase(
  lookup: DossierLookup,
  cache: SenatorCache,
  stats: SenatSyncResult
): Promise<void> {
  console.log("Phase 2: Downloading Rapports CSV...");
  const buf = await downloadCsvBuffer(RAPPORTS_CSV_URL);
  const rows = parseCsv<RapportRow>(buf);
  stats.rapports.rowsParsed = rows.length;
  console.log(`  Parsed ${rows.length} Rapports rows`);

  const unmatchedAuthors: Array<{
    firstName: string;
    lastName: string;
    rowKey: string;
    dossierId: string;
    role: DossierActorRole;
    commission: string | null;
  }> = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    try {
      const dossierId = findDossier(lookup, row["URL"], row["Titre long"] ?? row["Titre court"]);
      if (!dossierId) continue;
      stats.rapports.dossiersMatched++;

      // Determine role based on report type
      const typeRapport = (row["Type de rapport"] ?? "").toLowerCase();
      const role: DossierActorRole = typeRapport.includes("avis")
        ? DossierActorRole.RAPPORTEUR_AVIS
        : DossierActorRole.RAPPORTEUR;

      const commission = row["Organismes"]?.trim() || null;
      const authors = parseAuthorNames(row["Auteurs"] ?? "");

      for (const author of authors) {
        const politicianId = await lookupSenatorByExternalId(
          author.firstName,
          author.lastName,
          cache
        );
        if (politicianId) {
          stats.resolution.senatIdMatched++;
          await upsertDossierAuthor(
            dossierId,
            politicianId,
            role,
            Chamber.SENAT,
            commission,
            stats.rapports
          );
        } else {
          unmatchedAuthors.push({
            ...author,
            rowKey: `rapport-${i}`,
            dossierId,
            role,
            commission,
          });
        }
      }
    } catch (err) {
      stats.rapports.errors.push(
        `Rapports row ${i + 1}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // Batch resolve unmatched authors
  if (unmatchedAuthors.length > 0) {
    console.log(`  Resolving ${unmatchedAuthors.length} unmatched Rapports authors via batch...`);
    await resolveUnmatchedAuthors(unmatchedAuthors, cache, stats.resolution);

    for (const entry of unmatchedAuthors) {
      const key = senatorCacheKey(entry.firstName, entry.lastName);
      const politicianId = cache.get(key);
      if (politicianId) {
        await upsertDossierAuthor(
          entry.dossierId,
          politicianId,
          entry.role,
          Chamber.SENAT,
          entry.commission,
          stats.rapports
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// DossierAuthor upsert
// ---------------------------------------------------------------------------

async function upsertDossierAuthor(
  dossierId: string,
  politicianId: string,
  role: DossierActorRole,
  chamber: Chamber,
  commission: string | null,
  phaseStats: { authorsCreated: number; authorsSkipped: number }
): Promise<void> {
  try {
    await db.dossierAuthor.upsert({
      where: {
        dossierId_politicianId_role: {
          dossierId,
          politicianId,
          role,
        },
      },
      update: { chamber, commission },
      create: {
        dossierId,
        politicianId,
        role,
        chamber,
        commission,
      },
    });
    phaseStats.authorsCreated++;
  } catch {
    // Likely a FK constraint (dossier or politician deleted between lookup and upsert)
    phaseStats.authorsSkipped++;
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function syncLegislationSenat(): Promise<SenatSyncResult> {
  const stats: SenatSyncResult = {
    ppl: {
      rowsParsed: 0,
      dossiersMatched: 0,
      authorsCreated: 0,
      authorsSkipped: 0,
      errors: [],
    },
    rapports: {
      rowsParsed: 0,
      dossiersMatched: 0,
      authorsCreated: 0,
      authorsSkipped: 0,
      errors: [],
    },
    resolution: {
      senatIdMatched: 0,
      batchMatched: 0,
      notResolved: 0,
    },
  };

  console.log("=== Senate Legislation Sync ===\n");

  // Build dossier lookup maps once
  console.log("Building dossier lookup maps...");
  const lookup = await buildDossierLookup();
  console.log(`  ${lookup.urlMap.size} dossiers with senatUrl`);
  console.log(`  ${lookup.titleMap.size} dossiers indexed by title\n`);

  // Shared senator resolution cache across both phases
  const senatorCache: SenatorCache = new Map();

  // Phase 1: PPL (propositions de loi)
  try {
    await processPplPhase(lookup, senatorCache, stats);
    console.log(
      `  PPL complete: ${stats.ppl.dossiersMatched} dossiers matched, ${stats.ppl.authorsCreated} authors created\n`
    );
  } catch (err) {
    const msg = `PPL phase fatal: ${err instanceof Error ? err.message : String(err)}`;
    console.error(msg);
    stats.ppl.errors.push(msg);
  }

  // Phase 2: Rapports
  try {
    await processRapportsPhase(lookup, senatorCache, stats);
    console.log(
      `  Rapports complete: ${stats.rapports.dossiersMatched} dossiers matched, ${stats.rapports.authorsCreated} authors created\n`
    );
  } catch (err) {
    const msg = `Rapports phase fatal: ${err instanceof Error ? err.message : String(err)}`;
    console.error(msg);
    stats.rapports.errors.push(msg);
  }

  // Summary
  console.log("=== Resolution Summary ===");
  console.log(`  ExternalId matches: ${stats.resolution.senatIdMatched}`);
  console.log(`  Batch matches: ${stats.resolution.batchMatched}`);
  console.log(`  Not resolved: ${stats.resolution.notResolved}`);
  console.log(`  Senator cache size: ${senatorCache.size}`);

  const totalErrors = stats.ppl.errors.length + stats.rapports.errors.length;
  if (totalErrors > 0) {
    console.log(`  Errors: ${totalErrors}`);
  }

  return stats;
}
