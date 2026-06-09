import { db } from "@/lib/db";
import { DataSource, ElectionStatus, Judgement, Prisma } from "@/generated/prisma";
import { parse } from "csv-parse/sync";
import { NUANCE_POLITIQUE_MAPPING } from "@/config/labels";
import type { CandidatureMunicipaleCSV, CandidaturesSyncResult } from "./types";
import { HTTPClient } from "@/lib/api/http-client";
import { DATA_GOUV_RATE_LIMIT_MS } from "@/config/rate-limits";
import { resolveBatch } from "@/lib/identity";
import type { ResolveInput } from "@/lib/identity";
import { normalizeText, primarySurname } from "@/lib/name-matching";

// 2026 CSV (semicolon-delimited, UTF-8, no comment header)
const DEFAULT_CSV_URL =
  "https://static.data.gouv.fr/resources/elections-municipales-2026-listes-candidates-au-premier-tour/20260228-020703/municipales-2026-candidatures-france-entiere-tour-1-2026-02-28-02h24.csv";

const DEFAULT_ELECTION_SLUG = "municipales-2026";

// 500 rows per chunk: balances batch efficiency vs. DB round-trips.
// Within each chunk: 1 createMany (candidates) + 1 findMany + 1 createMany (candidacies) + N updates.
const CHUNK_SIZE = 500;

const dataGouvClient = new HTTPClient({
  rateLimitMs: DATA_GOUV_RATE_LIMIT_MS,
  sourceName: "data.gouv.fr (candidatures)",
});

/**
 * Fetch and parse the candidatures CSV (semicolon-delimited, UTF-8)
 */
async function fetchCandidaturesCSV(url: string): Promise<CandidatureMunicipaleCSV[]> {
  console.log(`Fetching candidatures from: ${url}`);

  const { data: buffer } = await dataGouvClient.getBuffer(url);
  const text = new TextDecoder("utf-8").decode(buffer);

  const records = parse(text, {
    delimiter: ";",
    columns: true,
    skip_empty_lines: true,
    bom: true,
    trim: true,
    relax_column_count: true,
    quote: '"',
    record_delimiter: ["\r\n", "\n"],
  }) as CandidatureMunicipaleCSV[];

  console.log(`Parsed ${records.length} candidature records`);
  return records;
}

/**
 * Match party by nuance code using NUANCE_POLITIQUE_MAPPING
 */
async function matchParty(nuanceCode: string): Promise<string | null> {
  const shortName = NUANCE_POLITIQUE_MAPPING[nuanceCode];
  if (!shortName) return null;

  const party = await db.party.findFirst({
    where: { shortName },
    select: { id: true },
  });

  return party?.id ?? null;
}

/**
 * Normalize a name from CSV (all-caps or mixed) to title case,
 * preserving hyphens and spaces.
 * "JEAN-PIERRE" -> "Jean-Pierre", "DE LA FONTAINE" -> "De La Fontaine"
 */
function normalizeName(raw: string): string {
  return raw.replace(/[A-Za-zÀ-ÿ]+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

/** Parsed row data extracted from a CSV row, ready for processing */
interface ParsedRow {
  /** Index in the toProcess array (for error reporting) */
  index: number;
  firstName: string;
  lastName: string;
  normalizedFirstName: string;
  normalizedLastName: string;
  gender: string | null;
  nationality: string | null;
  deptCode: string;
  codeCommune: string;
  communeName: string;
  nuanceCode: string;
  listName: string | null;
  listPosition: number | null;
  partyLabel: string | null;
  candidateName: string;
  constituencyCode: string;
  inseeCode: string;
}

/**
 * Pre-load all communes into a Map<inseeCode, true> for fast lookup.
 * Commune.id IS the INSEE code.
 */
async function loadCommuneMap(): Promise<Set<string>> {
  const communes = await db.commune.findMany({
    select: { id: true },
  });
  const set = new Set<string>();
  for (const c of communes) {
    set.add(c.id);
  }
  console.log(`  Pre-loaded ${set.size} communes`);
  return set;
}

/**
 * Pre-load all existing candidacies for a given election into a Map
 * keyed by "candidateName|constituencyCode" -> candidacyId.
 */
async function loadExistingCandidacies(electionId: string): Promise<Map<string, string>> {
  const existing = await db.candidacy.findMany({
    where: { electionId },
    select: { id: true, candidateName: true, constituencyCode: true },
  });
  const map = new Map<string, string>();
  for (const c of existing) {
    if (c.constituencyCode) {
      map.set(`${c.candidateName}|${c.constituencyCode}`, c.id);
    }
  }
  console.log(`  Pre-loaded ${map.size} existing candidacies`);
  return map;
}

/**
 * Pre-warm the party cache by resolving all nuance codes upfront.
 * There are only ~20-30 distinct nuance codes, so this is cheap.
 */
async function preWarmPartyCache(): Promise<Map<string, string | null>> {
  const cache = new Map<string, string | null>();
  const nuanceCodes = Object.keys(NUANCE_POLITIQUE_MAPPING);

  for (const code of nuanceCodes) {
    const partyId = await matchParty(code);
    cache.set(code, partyId);
  }

  console.log(`  Pre-warmed party cache: ${cache.size} nuance codes`);
  return cache;
}

/**
 * Pre-load Politician birthdates for RNE enrichment.
 * Key: "normalizedFirstName|normalizedLastName|departmentCode" → { birthDate, gender }
 * Also indexes by first word of multi-word surnames for double surname matching
 * (e.g. "Libert Albanel" also indexed as "Libert").
 * Only keeps unique matches (1 politician per name+dept) to avoid false enrichment.
 */
async function loadRNEBirthdateLookup(): Promise<
  Map<string, { birthDate: Date; gender: string | null }>
> {
  const mandates = await db.mandate.findMany({
    where: {
      localData: { isNot: null },
      politician: { birthDate: { not: null } },
    },
    select: {
      departmentCode: true,
      politician: {
        select: {
          firstName: true,
          lastName: true,
          birthDate: true,
          civility: true,
        },
      },
    },
  });

  // First pass: count occurrences per key to detect ambiguous matches
  // Include both full-name keys and primary-surname fallback keys
  const counts = new Map<string, number>();
  for (const m of mandates) {
    const normFirst = normalizeText(m.politician.firstName);
    const normLast = normalizeText(m.politician.lastName);
    const key = `${normFirst}|${normLast}|${m.departmentCode}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);

    const primary = primarySurname(normLast);
    if (primary) {
      const fwKey = `${normFirst}|${primary}|${m.departmentCode}`;
      counts.set(fwKey, (counts.get(fwKey) ?? 0) + 1);
    }
  }

  // Second pass: only keep unique matches (1 politician per name+dept)
  const map = new Map<string, { birthDate: Date; gender: string | null }>();
  for (const m of mandates) {
    const gender = m.politician.civility === "Mme" ? "F" : "M";
    const data = { birthDate: m.politician.birthDate!, gender };
    const normFirst = normalizeText(m.politician.firstName);
    const normLast = normalizeText(m.politician.lastName);
    const key = `${normFirst}|${normLast}|${m.departmentCode}`;
    if (counts.get(key) === 1) {
      map.set(key, data);
    }

    // Fallback: index by primary surname for double surname matching
    const primary = primarySurname(normLast);
    if (primary) {
      const fwKey = `${normFirst}|${primary}|${m.departmentCode}`;
      if (counts.get(fwKey) === 1 && !map.has(fwKey)) {
        map.set(fwKey, data);
      }
    }
  }
  return map;
}

/**
 * Sync candidatures municipales from a data.gouv.fr CSV
 */
export async function syncCandidaturesMunicipales(
  options: {
    url?: string;
    election?: string;
    dryRun?: boolean;
    limit?: number;
    verbose?: boolean;
  } = {}
): Promise<CandidaturesSyncResult> {
  const {
    url = DEFAULT_CSV_URL,
    election: electionSlug = DEFAULT_ELECTION_SLUG,
    dryRun = false,
    limit,
    verbose = false,
  } = options;

  // Find the target election
  const electionRecord = await db.election.findUnique({
    where: { slug: electionSlug },
  });

  if (!electionRecord) {
    throw new Error(`Election "${electionSlug}" not found. Run 'npm run seed:elections' first.`);
  }

  console.log(`Target election: ${electionRecord.title} (${electionRecord.slug})`);

  // ─── Phase A: Pre-load reference data ───────────────────────────────
  console.log("\nPhase A: Pre-loading reference data...");

  // Sequential to avoid pool starvation (pool max: 2, these are 4 queries)
  const communeSet = await loadCommuneMap();
  const existingCandidacyMap = await loadExistingCandidacies(electionRecord.id);
  const partyCache = await preWarmPartyCache();
  const rneLookup = await loadRNEBirthdateLookup();
  console.log(`  Pre-loaded ${rneLookup.size} RNE birthdates for enrichment`);

  // ─── Fetch and parse CSV ────────────────────────────────────────────
  const records = await fetchCandidaturesCSV(url);
  const toProcess = limit ? records.slice(0, limit) : records;

  // ─── Parse all rows upfront (CPU-only, no DB) ──────────────────────
  console.log(`\nParsing ${toProcess.length} rows...`);
  const parsedRows: ParsedRow[] = [];
  const parseErrors: string[] = [];

  for (let i = 0; i < toProcess.length; i++) {
    const row = toProcess[i];
    const nom = row!["Nom sur le bulletin de vote"];
    const prenom = row!["Prénom sur le bulletin de vote"];

    if (!nom || !prenom) {
      parseErrors.push(`Row ${i + 1}: missing candidate name`);
      continue;
    }

    const deptCode = row!["Code département"];
    const codeCirconscription = row!["Code circonscription"];
    const nuanceCode = row!["Code nuance de liste"] || "";
    const rawListName = row!["Libellé de la liste"] || row!["Libellé abrégé de liste"];
    const rawListPosition = parseInt(row!["Ordre"], 10);
    const gender = row!["Sexe"] || null;
    const nationality = row!["Nationalité"] || null;

    parsedRows.push({
      index: i,
      firstName: prenom,
      lastName: nom,
      normalizedFirstName: normalizeName(prenom),
      normalizedLastName: normalizeName(nom),
      gender: gender === "M" || gender === "F" ? gender : null,
      nationality: nationality || null,
      deptCode,
      codeCommune: codeCirconscription,
      communeName: row!["Circonscription"],
      nuanceCode,
      listName: rawListName || null,
      listPosition: isNaN(rawListPosition) ? null : rawListPosition,
      partyLabel: NUANCE_POLITIQUE_MAPPING[nuanceCode] || nuanceCode || null,
      candidateName: `${prenom} ${nom}`,
      constituencyCode: codeCirconscription,
      inseeCode: codeCirconscription, // 2026 CSV: Code circonscription IS the INSEE code
    });
  }

  console.log(`  Parsed: ${parsedRows.length} valid rows, ${parseErrors.length} parse errors`);

  if (dryRun) {
    // Dry run: just report what we'd do
    const politiciansMatched = 0;
    const politiciansNotFound = 0;
    let candidaciesWithCommune = 0;

    for (const row of parsedRows) {
      if (communeSet.has(row.inseeCode)) candidaciesWithCommune++;

      if (verbose) {
        const communeMatch = communeSet.has(row.inseeCode) ? "[COMMUNE]" : "";
        console.log(
          `  [DRY-RUN] ${row.candidateName} | ${row.communeName} | ${row.nuanceCode} | list: ${row.listName} #${row.listPosition} ${communeMatch}`
        );
      }
    }

    return {
      success: parseErrors.length === 0,
      candidaciesCreated: 0,
      candidaciesUpdated: 0,
      candidatesCreated: 0,
      candidaciesWithCommune,
      politiciansMatched,
      politiciansNotFound,
      errors: parseErrors,
    };
  }

  // ─── Phase B: Batch resolve politicians (resolveBatch) ──────────────
  console.log(`\nPhase B: Resolving politicians via resolveBatch...`);

  // Deduplicate resolve inputs by name+dept (avoid resolving "Jean Martin, dept 75" 10 times)
  const resolveInputMap = new Map<string, ResolveInput>();
  let enrichedCount = 0;
  for (const row of parsedRows) {
    const key = `${row.normalizedFirstName}|${row.normalizedLastName}|${row.deptCode}`;
    if (!resolveInputMap.has(key)) {
      const resolveInput: ResolveInput = {
        firstName: row.normalizedFirstName,
        lastName: row.normalizedLastName,
        source: DataSource.MUNICIPALES,
        sourceId: key,
        department: row.deptCode,
        gender: row.gender,
      };
      // Pre-enrich with RNE birthdate (officials re-running in their dept)
      const normFirst = normalizeText(row.normalizedFirstName);
      const normLast = normalizeText(row.normalizedLastName);
      const rneKey = `${normFirst}|${normLast}|${row.deptCode}`;
      let rneMatch = rneLookup.get(rneKey);
      // Fallback: try primary surname for double surname matching
      if (!rneMatch) {
        const primary = primarySurname(normLast);
        if (primary) {
          rneMatch = rneLookup.get(`${normFirst}|${primary}|${row.deptCode}`);
        }
      }
      if (rneMatch) {
        resolveInput.birthDate = rneMatch.birthDate;
        enrichedCount++;
      }
      resolveInputMap.set(key, resolveInput);
    }
  }
  console.log(`  Inputs enriched with RNE birthdates: ${enrichedCount}`);

  const resolveInputs = Array.from(resolveInputMap.values());
  console.log(
    `  ${resolveInputs.length} unique name+dept combos to resolve (from ${parsedRows.length} rows)`
  );

  const batchResult = await resolveBatch({
    inputs: resolveInputs,
    sourceType: DataSource.MUNICIPALES,
    onProgress: (processed, total) => {
      console.log(`  Resolve progress: ${processed}/${total}`);
    },
  });

  console.log(
    `  Resolve complete: ${batchResult.stats.matched} matched, ${batchResult.stats.review} review, ` +
      `${batchResult.stats.notFound} not found, ${batchResult.stats.blocked} blocked`
  );

  // Build politician lookup from batch results: "firstName|lastName|deptCode" → politicianId
  const politicianCache = new Map<string, string | null>();
  for (const r of batchResult.results) {
    if (r.politicianId && r.decision === Judgement.SAME) {
      politicianCache.set(r.sourceId, r.politicianId);
    }
  }

  let politiciansMatched = 0;
  let politiciansNotFound = 0;

  // ─── Phase C: Process in chunks ─────────────────────────────────────
  console.log(`\nPhase C: Processing ${parsedRows.length} rows in chunks of ${CHUNK_SIZE}...`);

  let candidaciesCreated = 0;
  let candidaciesUpdated = 0;
  let candidatesCreated = 0;
  let candidaciesWithCommune = 0;
  const errors: string[] = [...parseErrors];

  const totalChunks = Math.ceil(parsedRows.length / CHUNK_SIZE);

  for (let chunkIdx = 0; chunkIdx < totalChunks; chunkIdx++) {
    const chunkStart = chunkIdx * CHUNK_SIZE;
    const chunk = parsedRows.slice(chunkStart, chunkStart + CHUNK_SIZE);

    try {
      // ── Step 1: Collect unique candidate identities in this chunk ──
      const uniqueCandidates = new Map<
        string,
        { firstName: string; lastName: string; gender: string | null; nationality: string | null }
      >();

      for (const row of chunk) {
        const key = `${row.normalizedFirstName}|${row.normalizedLastName}`;
        if (!uniqueCandidates.has(key)) {
          uniqueCandidates.set(key, {
            firstName: row.normalizedFirstName,
            lastName: row.normalizedLastName,
            gender: row.gender,
            nationality: row.nationality,
          });
        }
      }

      // ── Step 2: Batch-create Candidate records ─────────────────────
      const candidateData: Prisma.CandidateCreateManyInput[] = [];
      for (const c of uniqueCandidates.values()) {
        candidateData.push({
          firstName: c.firstName,
          lastName: c.lastName,
          gender: c.gender,
          nationality: c.nationality,
        });
      }

      if (candidateData.length > 0) {
        const result = await db.candidate.createMany({
          data: candidateData,
          skipDuplicates: true,
        });
        candidatesCreated += result.count;
      }

      // ── Step 3: Fetch back Candidate IDs for this chunk ────────────
      const namePairs = Array.from(uniqueCandidates.values());
      const candidateRecords = await db.candidate.findMany({
        where: {
          OR: namePairs.map((c) => ({
            firstName: c.firstName,
            lastName: c.lastName,
            politicianId: null,
          })),
        },
        select: { id: true, firstName: true, lastName: true },
      });

      const candidateIdMap = new Map<string, string>();
      for (const c of candidateRecords) {
        candidateIdMap.set(`${c.firstName}|${c.lastName}`, c.id);
      }

      // ── Step 4: Lookup politicians from batch cache ─────────────────
      const rowPoliticianIds: (string | null)[] = [];
      for (const row of chunk) {
        const cacheKey = `${row.normalizedFirstName}|${row.normalizedLastName}|${row.deptCode}`;
        const politicianId = politicianCache.get(cacheKey) ?? null;
        rowPoliticianIds.push(politicianId);

        if (politicianId) {
          politiciansMatched++;
        } else {
          politiciansNotFound++;
        }
      }

      // ── Step 5: Upsert candidacies for this chunk ──────────────────
      const toCreate: Prisma.CandidacyCreateManyInput[] = [];

      for (let j = 0; j < chunk.length; j++) {
        const row = chunk[j];
        const politicianId = rowPoliticianIds[j] ?? null;

        try {
          const candidateKey = `${row!.normalizedFirstName}|${row!.normalizedLastName}`;
          const candidateId = candidateIdMap.get(candidateKey) ?? null;

          const communeId = communeSet.has(row!.inseeCode) ? row!.inseeCode : null;
          if (communeId) candidaciesWithCommune++;

          const partyId = partyCache.get(row!.nuanceCode) ?? null;

          const existingKey = `${row!.candidateName}|${row!.constituencyCode}`;
          const existingId = existingCandidacyMap.get(existingKey);

          if (existingId) {
            await db.candidacy.update({
              where: { id: existingId },
              data: {
                politicianId,
                partyId,
                partyLabel: row!.partyLabel,
                listName: row!.listName,
                listPosition: row!.listPosition,
                constituencyName: row!.communeName,
                candidateId,
                communeId,
              },
            });
            candidaciesUpdated++;
          } else {
            toCreate.push({
              electionId: electionRecord.id,
              politicianId,
              partyId,
              candidateName: row!.candidateName,
              partyLabel: row!.partyLabel,
              listName: row!.listName,
              listPosition: row!.listPosition,
              constituencyCode: row!.constituencyCode,
              constituencyName: row!.communeName,
              candidateId,
              communeId,
            });
          }
        } catch (error) {
          errors.push(`Row ${row!.index + 1}: ${error}`);
        }
      }

      if (toCreate.length > 0) {
        await db.candidacy.createMany({ data: toCreate, skipDuplicates: true });
        candidaciesCreated += toCreate.length;
      }
    } catch (error) {
      errors.push(`Chunk ${chunkIdx + 1}: ${error}`);
    }

    const processedCount = Math.min((chunkIdx + 1) * CHUNK_SIZE, parsedRows.length);
    if (verbose || (chunkIdx + 1) % 10 === 0 || chunkIdx === totalChunks - 1) {
      console.log(
        `  Chunk ${chunkIdx + 1}/${totalChunks} — ${processedCount}/${parsedRows.length} rows ` +
          `(created: ${candidaciesCreated}, candidates: ${candidatesCreated}, communes: ${candidaciesWithCommune})`
      );
    }
  }

  // ─── Update election status ─────────────────────────────────────────
  if (!dryRun && candidaciesCreated > 0) {
    await db.election.update({
      where: { id: electionRecord.id },
      data: { status: ElectionStatus.CANDIDACIES },
    });
    console.log(`\nElection status updated to CANDIDACIES`);
  }

  // ─── Maintenance : VACUUM ANALYZE après l'import massif ──────────────
  // Met à jour la visibility map (sinon les index-only scans, ex. parité,
  // retombent sur le heap) et les stats du planner. Non bloquant : une
  // erreur de maintenance ne doit pas faire échouer le sync.
  if (!dryRun && (candidaciesCreated > 0 || candidaciesUpdated > 0)) {
    try {
      console.log(`\nRunning VACUUM (ANALYZE) on "Candidacy"...`);
      await db.$executeRaw(Prisma.sql`VACUUM (ANALYZE) "Candidacy"`);
      console.log(`  VACUUM ANALYZE done`);
    } catch (error) {
      console.warn(`  VACUUM ANALYZE skipped: ${error}`);
    }
  }

  console.log(`\nResults:`);
  console.log(`  Candidacies created: ${candidaciesCreated}`);
  console.log(`  Candidacies updated: ${candidaciesUpdated}`);
  console.log(`  Candidates created: ${candidatesCreated}`);
  console.log(`  Communes linked: ${candidaciesWithCommune}`);
  console.log(`  Politicians matched: ${politiciansMatched}`);
  console.log(`  Politicians not found: ${politiciansNotFound}`);
  console.log(`  Party nuances cached: ${partyCache.size}`);
  console.log(`  Politician lookups cached: ${politicianCache.size}`);
  console.log(`  Errors: ${errors.length}`);

  return {
    success: errors.length === 0,
    candidaciesCreated,
    candidaciesUpdated,
    candidatesCreated,
    candidaciesWithCommune,
    politiciansMatched,
    politiciansNotFound,
    errors,
  };
}

/**
 * Get candidatures statistics
 */
export async function getCandidaturesStats() {
  const [totalCandidacies, candidaciesByElection, matchedCandidacies] = await Promise.all([
    db.candidacy.count(),
    db.candidacy.groupBy({
      by: ["electionId"],
      _count: { id: true },
    }),
    db.candidacy.count({
      where: { politicianId: { not: null } },
    }),
  ]);

  // Fetch election titles for display
  const electionIds = candidaciesByElection.map((g) => g.electionId);
  const elections = await db.election.findMany({
    where: { id: { in: electionIds } },
    select: { id: true, title: true, slug: true, status: true },
  });

  const electionMap = new Map(elections.map((e) => [e.id, e]));

  return {
    totalCandidacies,
    matchedCandidacies,
    byElection: candidaciesByElection.map((g) => ({
      election: electionMap.get(g.electionId),
      count: g._count.id,
    })),
  };
}
