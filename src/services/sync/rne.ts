import { db } from "@/lib/db";
import { DataSource, Judgement, MandateType, PublicationStatus } from "@/generated/prisma";
import { parse } from "csv-parse/sync";
import type { MaireRNECSV, RNESyncResult } from "./types";
import { HTTPClient } from "@/lib/api/http-client";
import { DATA_GOUV_RATE_LIMIT_MS } from "@/config/rate-limits";
import { NUANCE_POLITIQUE_MAPPING } from "@/config/labels";
import { resolveBatch } from "@/lib/identity";
import { generateSlug } from "@/lib/utils";
import { mandateLabels, mandateStartDate, parseMaireRows, type ParsedMaireRow } from "./rne-parse";

const client = new HTTPClient({ rateLimitMs: DATA_GOUV_RATE_LIMIT_MS });

const RNE_MAIRES_CSV_URL =
  "https://static.data.gouv.fr/resources/repertoire-national-des-elus-1/20251223-104211/elus-maires-mai.csv";

/** Rows are written in chunks so one failure does not roll back the whole file. */
const UPSERT_BATCH_SIZE = 500;

/** Fetch and parse RNE maires CSV */
async function fetchRNECSV(): Promise<MaireRNECSV[]> {
  console.log(`Fetching RNE maires data from: ${RNE_MAIRES_CSV_URL}`);

  const { data: csvText } = await client.getText(RNE_MAIRES_CSV_URL);
  const records = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    delimiter: ";",
    bom: true,
  }) as MaireRNECSV[];

  console.log(`Parsed ${records.length} maire records`);
  return records;
}

// ============================================
// Phase 0: snapshot
// ============================================

interface MayorSnapshot {
  id: string;
  politicianId: string;
  localData: { communeId: string | null; rneExternalId: string | null } | null;
}

/**
 * The mayors we hold before the import, plus the communes we can legally reference.
 *
 * The snapshot is taken first because phase 3 needs to know which mandates existed *before* the
 * file was applied, and phase 1 has already overwritten them by then.
 */
async function snapshotCurrentMayors(): Promise<{
  mandates: MayorSnapshot[];
  knownCommuneIds: Set<string>;
}> {
  console.log("\n--- Phase 0: Snapshot current mayors from DB ---");

  const mandates = await db.mandate.findMany({
    where: {
      type: MandateType.MAIRE,
      isCurrent: true,
      localData: { isNot: null },
    },
    select: {
      id: true,
      politicianId: true,
      localData: { select: { communeId: true, rneExternalId: true } },
    },
  });
  console.log(`  Found ${mandates.length} current mayor mandates in DB`);

  const existingCommunes = await db.commune.findMany({ select: { id: true } });
  const knownCommuneIds = new Set(existingCommunes.map((c) => c.id));
  console.log(`  Loaded ${knownCommuneIds.size} existing communes for FK validation`);

  return { mandates, knownCommuneIds };
}

// ============================================
// Phase 1: upsert
// ============================================

interface UpsertCounts {
  created: number;
  updated: number;
  errors: string[];
}

/** Existing MandateLocal rows keyed by the INSEE code they were imported under. */
async function loadExistingByInsee(): Promise<
  Map<string, { mandateId: string; politicianId: string; mandateLocalId: string }>
> {
  const existing = new Map<
    string,
    { mandateId: string; politicianId: string; mandateLocalId: string }
  >();

  const rows = await db.mandateLocal.findMany({
    where: { rneExternalId: { not: null } },
    select: {
      id: true,
      rneExternalId: true,
      mandate: { select: { id: true, politicianId: true } },
    },
  });

  for (const local of rows) {
    if (!local.rneExternalId) continue;
    existing.set(local.rneExternalId, {
      mandateId: local.mandate.id,
      politicianId: local.mandate.politicianId,
      mandateLocalId: local.id,
    });
  }

  console.log(`  Loaded ${existing.size} existing MandateLocal records by INSEE code`);
  return existing;
}

async function updateExistingMaire(
  row: ParsedMaireRow,
  existing: { mandateId: string; politicianId: string; mandateLocalId: string }
): Promise<void> {
  const { title, constituency } = mandateLabels(row);

  await db.mandate.update({
    where: { id: existing.mandateId },
    data: {
      title,
      constituency,
      departmentCode: row.deptCode,
      startDate: mandateStartDate(row),
      isCurrent: true,
      endDate: null,
    },
  });

  await db.mandateLocal.update({
    where: { id: existing.mandateLocalId },
    data: { communeId: row.communeId, functionStart: row.functionStart },
  });

  await db.politician.update({
    where: { id: existing.politicianId },
    data: { civility: row.civility, birthDate: row.birthDate },
  });
}

async function createMaire(row: ParsedMaireRow, verbose: boolean): Promise<void> {
  const { title, constituency } = mandateLabels(row);

  // Two mayors can share a name. The INSEE suffix keeps the second slug unique.
  const baseSlug = generateSlug(`${row.firstName} ${row.lastName}`);
  const taken = await db.politician.findUnique({
    where: { slug: baseSlug },
    select: { id: true },
  });
  const slug = taken ? `${baseSlug}-${row.inseeCode}` : baseSlug;

  const created = await db.politician.create({
    data: {
      slug,
      civility: row.civility,
      firstName: row.firstName,
      lastName: row.lastName,
      fullName: row.fullName,
      birthDate: row.birthDate,
      source: DataSource.RNE,
      publicationStatus: PublicationStatus.PUBLISHED,
      mandates: {
        create: {
          type: MandateType.MAIRE,
          title,
          institution: "Commune",
          constituency,
          departmentCode: row.deptCode,
          startDate: mandateStartDate(row),
          isCurrent: true,
          source: DataSource.RNE,
          localData: {
            create: {
              communeId: row.communeId,
              functionStart: row.functionStart,
              rneExternalId: row.inseeCode,
            },
          },
        },
      },
    },
  });

  if (verbose) {
    console.log(`  Created politician: ${row.fullName} (${row.inseeCode}) -> ${created.id}`);
  }
}

/** Write the parsed rows, one commune at a time, collecting failures instead of throwing. */
async function upsertMaires(rows: ParsedMaireRow[], verbose: boolean): Promise<UpsertCounts> {
  const existingByInsee = await loadExistingByInsee();
  const counts: UpsertCounts = { created: 0, updated: 0, errors: [] };

  for (let start = 0; start < rows.length; start += UPSERT_BATCH_SIZE) {
    for (const row of rows.slice(start, start + UPSERT_BATCH_SIZE)) {
      try {
        const existing = existingByInsee.get(row.inseeCode);
        if (existing) {
          await updateExistingMaire(row, existing);
          counts.updated++;
        } else {
          await createMaire(row, verbose);
          counts.created++;
        }
      } catch (err) {
        counts.errors.push(`Upsert failed for ${row.fullName} (${row.inseeCode}): ${err}`);
      }
    }

    if ((start + UPSERT_BATCH_SIZE) % 5000 < UPSERT_BATCH_SIZE) {
      console.log(`  Progress: ${Math.min(start + UPSERT_BATCH_SIZE, rows.length)}/${rows.length}`);
    }
  }

  return counts;
}

// ============================================
// Phase 2: reconcile
// ============================================

/**
 * Fold the stubs this import just created into the politicians we already knew.
 *
 * A mayor who is also a deputy exists twice after phase 1: once nationally, once as an RNE stub.
 * The resolver decides; only a `SAME` judgement moves the mandates and deletes the stub.
 */
async function reconcileRNEStubs(
  communeNameByInsee: Map<string, string>,
  verbose: boolean
): Promise<{ matched: number; notFound: number; errors: string[] }> {
  console.log(
    "\n--- Phase 2: Reconcile new RNE Politicians with existing national Politicians ---"
  );

  const rneOnlyPoliticians = await db.politician.findMany({
    where: {
      source: DataSource.RNE,
      externalIds: { none: {} },
      mandates: {
        some: {
          type: MandateType.MAIRE,
          isCurrent: true,
          localData: { isNot: null },
        },
      },
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      birthDate: true,
      mandates: {
        where: { type: MandateType.MAIRE, isCurrent: true },
        select: {
          id: true,
          departmentCode: true,
          localData: { select: { rneExternalId: true, communeId: true } },
        },
        take: 1,
      },
    },
  });

  console.log(`  Found ${rneOnlyPoliticians.length} RNE-only Politicians to reconcile`);
  if (rneOnlyPoliticians.length === 0) return { matched: 0, notFound: 0, errors: [] };

  const politicianBySourceId = new Map<string, (typeof rneOnlyPoliticians)[number]>();
  const inputs = rneOnlyPoliticians.map((politician) => {
    const mandate = politician.mandates[0];
    const sourceId =
      mandate?.localData?.rneExternalId || mandate?.localData?.communeId || politician.id;
    politicianBySourceId.set(sourceId, politician);

    return {
      firstName: politician.firstName,
      lastName: politician.lastName,
      birthDate: politician.birthDate,
      source: DataSource.RNE,
      sourceId,
      department: mandate?.departmentCode || undefined,
      mandateType: MandateType.MAIRE,
      context: {
        commune: communeNameByInsee.get(mandate?.localData?.rneExternalId ?? "") ?? null,
      },
    };
  });

  const batchResult = await resolveBatch({
    sourceType: DataSource.RNE,
    inputs,
    onProgress: (processed, total) => {
      if (processed % 5000 === 0 || processed === total) {
        console.log(`  Phase 2 progress: ${processed}/${total}`);
      }
    },
  });

  console.log(
    `  Phase 2 complete: ${batchResult.stats.matched} matched, ${batchResult.stats.review} review, ${batchResult.stats.notFound} not found, ${batchResult.stats.blocked} blocked`
  );

  const errors: string[] = [];
  let matched = 0;

  for (const result of batchResult.results) {
    const existingPoliticianId = result.politicianId;
    if (!existingPoliticianId) continue;
    if (result.decision !== Judgement.SAME) continue;

    const stub = politicianBySourceId.get(result.sourceId);
    if (!stub) continue;
    if (stub.id === existingPoliticianId) continue; // already the same record

    matched++;

    try {
      await db.mandate.updateMany({
        where: { politicianId: stub.id },
        data: { politicianId: existingPoliticianId },
      });
      await db.politician.delete({ where: { id: stub.id } });

      if (verbose) {
        console.log(
          `  Merged: RNE stub ${stub.id} (${stub.firstName} ${stub.lastName}) -> existing politician ${existingPoliticianId} [${result.method}, confidence=${result.confidence}]`
        );
      }
    } catch (err) {
      errors.push(`Merge failed for ${stub.firstName} ${stub.lastName}: ${err}`);
    }
  }

  return {
    matched,
    notFound: batchResult.stats.notFound + batchResult.stats.blocked,
    errors,
  };
}

// ============================================
// Phase 3: close what left the file
// ============================================

/** A mandate whose commune is no longer in the file has ended, so close it. */
async function closeStaleMandates(
  snapshot: MayorSnapshot[],
  seenCommuneIds: Set<string>
): Promise<{ closed: number; errors: string[] }> {
  console.log("\n--- Phase 3: Close stale mandates ---");

  const stale = snapshot.filter((mandate) => {
    const identifier = mandate.localData?.rneExternalId || mandate.localData?.communeId;
    return identifier && !seenCommuneIds.has(identifier);
  });

  console.log(`  Found ${stale.length} stale mandates to close`);

  const errors: string[] = [];
  let closed = 0;

  for (const mandate of stale) {
    try {
      await db.mandate.update({
        where: { id: mandate.id },
        data: { isCurrent: false, endDate: new Date() },
      });
      closed++;
    } catch (error) {
      errors.push(`Close stale mandate ${mandate.id}: ${error}`);
    }
  }

  console.log(`  Phase 3 complete: ${closed} mandates closed`);
  return { closed, errors };
}

/** Announce a large import on the platform feed. Never let this break the sync. */
async function recordPlatformUpdate(totalUpserted: number): Promise<void> {
  if (totalUpserted <= 100) return;

  try {
    await db.platformUpdate.create({
      data: {
        title: `${totalUpserted.toLocaleString("fr-FR")} maires mis à jour depuis le RNE`,
        type: "DATA_IMPORT",
        metadata: { count: totalUpserted, entity: "maires" },
      },
    });
  } catch {
    console.warn("Failed to create platform update entry");
  }
}

/**
 * Sync RNE maires data — 4-phase pipeline:
 *   Phase 0: Snapshot current mayors from DB (MAIRE mandates with MandateLocal)
 *   Phase 1: Parse CSV + upsert Politician + Mandate + MandateLocal (500-row batches)
 *   Phase 2: Reconcile newly created RNE Politicians against existing national Politicians
 *   Phase 3: Close stale mandates no longer in CSV
 *
 * Each phase is its own function. They used to be one 483-line body, which meant the parsing
 * could not be tested without a database and the phase boundaries existed only as comments.
 */
export async function syncRNEMaires(
  options: {
    dryRun?: boolean;
    limit?: number;
    verbose?: boolean;
  } = {}
): Promise<RNESyncResult> {
  const { dryRun = false, limit, verbose = false } = options;

  const { mandates: snapshot, knownCommuneIds } = await snapshotCurrentMayors();

  console.log("\n--- Phase 1: Parse CSV + upsert Politician + Mandate + MandateLocal ---");
  const records = await fetchRNECSV();
  const toProcess = limit ? records.slice(0, limit) : records;
  console.log(`Processing ${toProcess.length} maires...`);

  const parsed = parseMaireRows(toProcess, knownCommuneIds);
  if (parsed.duplicatesDropped > 0) {
    console.log(
      `  Deduplicated: ${parsed.rows.length + parsed.duplicatesDropped} → ${parsed.rows.length} (${parsed.duplicatesDropped} duplicates)`
    );
  }

  const errors = [...parsed.errors];

  if (dryRun) {
    console.log(`  [DRY-RUN] Would upsert ${parsed.rows.length} maires`);
    if (verbose) {
      for (const row of parsed.rows.slice(0, 10)) {
        console.log(`  [DRY-RUN] ${row.fullName} (${row.inseeCode})`);
      }
    }
    console.log(
      `  Phase 1 complete: ${parsed.rows.length} created, 0 updated, ${errors.length} errors`
    );
    console.log("\n[DRY-RUN] Skipping phases 2-3");

    return {
      success: errors.length === 0,
      officialsCreated: parsed.rows.length,
      officialsUpdated: 0,
      officialsClosed: 0,
      mandatesCreated: 0,
      mandatesUpdated: 0,
      mandatesClosed: 0,
      politiciansMatched: 0,
      politiciansNotFound: 0,
      errors,
    };
  }

  const upserted = await upsertMaires(parsed.rows, verbose);
  errors.push(...upserted.errors);
  console.log(
    `  Phase 1 complete: ${upserted.created} created, ${upserted.updated} updated, ${errors.length} errors`
  );

  const reconciled = await reconcileRNEStubs(parsed.communeNameByInsee, verbose);
  errors.push(...reconciled.errors);

  const closed = await closeStaleMandates(snapshot, parsed.seenCommuneIds);
  errors.push(...closed.errors);

  console.log(`\n${"=".repeat(50)}`);
  console.log(`Results:`);
  console.log(`  Maires created:    ${upserted.created}`);
  console.log(`  Maires updated:    ${upserted.updated}`);
  console.log(`  Maires closed:     ${closed.closed}`);
  console.log(`  Mandates created:  ${upserted.created}`);
  console.log(`  Mandates updated:  ${upserted.updated}`);
  console.log(`  Mandates closed:   ${closed.closed}`);
  console.log(`  Politicians matched: ${reconciled.matched}`);
  console.log(`  Politicians not found: ${reconciled.notFound}`);
  console.log(`  Errors: ${errors.length}`);

  await recordPlatformUpdate(upserted.created + upserted.updated);

  return {
    success: errors.length === 0,
    officialsCreated: upserted.created,
    officialsUpdated: upserted.updated,
    officialsClosed: closed.closed,
    mandatesCreated: upserted.created,
    mandatesUpdated: upserted.updated,
    mandatesClosed: closed.closed,
    politiciansMatched: reconciled.matched,
    politiciansNotFound: reconciled.notFound,
    errors,
  };
}

// ============================================
// Party resolution
// ============================================

const ENRICHED_COMMUNES_CSV_URL =
  "https://www.data.gouv.fr/api/1/datasets/r/ea5d6bc3-37d0-4884-a437-155a90c3e05f";

/**
 * Resolve party affiliations for maires using:
 * 1. Enriched communes CSV (data.gouv.fr) → nuance_politique → NUANCE_POLITIQUE_MAPPING → partyId
 * 2. Inherit from Politician.currentPartyId if already set on a matched national politician
 */
export async function resolveParties(options: { verbose?: boolean } = {}): Promise<{
  fromNuance: number;
  fromPolitician: number;
  unmapped: string[];
}> {
  const { verbose = false } = options;

  // Step 1: Fetch enriched communes CSV and build inseeCode → nuanceCode map
  console.log(`Fetching enriched communes from: ${ENRICHED_COMMUNES_CSV_URL}`);
  const { data: csvText } = await client.getText(ENRICHED_COMMUNES_CSV_URL);
  const enrichedRows = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    delimiter: ",",
    bom: true,
  }) as Array<{
    cog_commune: string;
    nuance_politique: string;
    famille_nuance: string;
  }>;

  const nuanceMap = new Map<string, string>();
  for (const row of enrichedRows) {
    const code = row.cog_commune?.trim();
    const nuance = row.nuance_politique?.trim();
    if (code && nuance && nuance !== "NC" && nuance !== "LNC" && nuance !== "") {
      nuanceMap.set(code, nuance);
    }
  }
  console.log(`  Built nuance map: ${nuanceMap.size} communes with political nuance`);

  // Step 2: Pre-load parties by shortName for O(1) lookup
  const parties = await db.party.findMany({
    select: { id: true, shortName: true },
  });
  const partyByShortName = new Map<string, string>();
  for (const p of parties) {
    if (p.shortName) partyByShortName.set(p.shortName, p.id);
  }

  // Step 3: Find current MAIRE mandates where politician has no currentPartyId
  const mandates = await db.mandate.findMany({
    where: {
      type: MandateType.MAIRE,
      isCurrent: true,
      localData: { isNot: null },
      politician: { currentPartyId: null },
    },
    select: {
      id: true,
      politicianId: true,
      localData: { select: { rneExternalId: true } },
    },
  });

  console.log(`  Found ${mandates.length} maires without party to resolve`);

  let fromNuance = 0;
  const fromPolitician = 0;
  const unmappedNuances = new Set<string>();

  // Build batched updates: Map<partyId, politicianIds[]>
  const updatesByParty = new Map<string, string[]>();

  for (const mandate of mandates) {
    const rneId = mandate.localData?.rneExternalId;
    if (!rneId) continue;

    const nuance = nuanceMap.get(rneId);
    if (!nuance) continue;

    const shortName = NUANCE_POLITIQUE_MAPPING[nuance];
    if (!shortName) {
      unmappedNuances.add(`${nuance} (no mapping)`);
      continue;
    }

    const partyId = partyByShortName.get(shortName);
    if (!partyId) {
      unmappedNuances.add(`${nuance} → ${shortName} (no party in DB)`);
      continue;
    }

    const list = updatesByParty.get(partyId) || [];
    list.push(mandate.politicianId);
    updatesByParty.set(partyId, list);
    fromNuance++;
  }

  // Step 4: Batch UPDATE Politician.currentPartyId grouped by partyId
  for (const [partyId, politicianIds] of updatesByParty) {
    await db.politician.updateMany({
      where: { id: { in: politicianIds } },
      data: { currentPartyId: partyId },
    });
  }

  if (verbose && unmappedNuances.size > 0) {
    console.log(`  Unmapped nuances:`);
    for (const n of unmappedNuances) {
      console.log(`    - ${n}`);
    }
  }

  console.log(
    `  Party resolution complete: ${fromNuance} from nuance, ${fromPolitician} from politician, ${unmappedNuances.size} unmapped nuance codes`
  );

  return { fromNuance, fromPolitician, unmapped: [...unmappedNuances] };
}

/**
 * Get RNE sync statistics (queries Mandate + MandateLocal tables)
 */
export async function getRNEStats() {
  const totalMaires = await db.mandate.count({
    where: { type: MandateType.MAIRE, localData: { isNot: null } },
  });
  const totalWithNationalPresence = await db.mandate.count({
    where: {
      type: MandateType.MAIRE,
      localData: { isNot: null },
      politician: { externalIds: { some: {} } },
    },
  });
  const totalCurrent = await db.mandate.count({
    where: { type: MandateType.MAIRE, isCurrent: true, localData: { isNot: null } },
  });

  return { totalMaires, totalWithNationalPresence, totalCurrent };
}
