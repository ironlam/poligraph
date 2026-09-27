import { db, type DbTransactionClient } from "@/lib/db";
import { writeFileSync } from "node:fs";
import { DataSource, Judgement, MandateType, PublicationStatus } from "@/generated/prisma";
import { parse } from "csv-parse/sync";
import type { MaireRNECSV, RNESyncResult } from "./types";
import { HTTPClient } from "@/lib/api/http-client";
import { DATA_GOUV_RATE_LIMIT_MS } from "@/config/rate-limits";
import { NUANCE_POLITIQUE_MAPPING } from "@/config/labels";
import { resolveBatch } from "@/lib/identity";
import { generateSlug } from "@/lib/utils";
import { mandateLabels, mandateStartDate, parseMaireRows, type ParsedMaireRow } from "./rne-parse";
import {
  compareHolder,
  decidePhase1Action,
  isChronologicallyClosable,
  isFurtherTerm,
  shouldRunStaleSweep,
  type HolderFacts,
} from "./rne-holder";
import { resolveRneResourceUrl, RNE_MAIRES_FRAGMENTS } from "./rne-resource";

const client = new HTTPClient({ rateLimitMs: DATA_GOUV_RATE_LIMIT_MS });

/** Rows are written in chunks so one failure does not roll back the whole file. */
const UPSERT_BATCH_SIZE = 500;

/** A commune code identifies a mandate location, not its holder. Keep writes suspended. */
function assertRNEReadOnly(dryRun: unknown): void {
  if (dryRun !== true) {
    throw new Error(
      "RNE_WRITES_SUSPENDED: mayor identity matching must be corrected before writes resume. " +
        "Only syncRNEMaires({ dryRun: true }) and getRNEStats() are available; " +
        "party resolution is also suspended."
    );
  }
}

/** Fetch and parse RNE maires CSV */
async function fetchRNECSV(): Promise<MaireRNECSV[]> {
  // Résolue à chaque exécution : l'URL pinnée ici renvoyait 404, le nom du
  // fichier ayant perdu une lettre en plus de changer d'horodatage.
  const url = await resolveRneResourceUrl(RNE_MAIRES_FRAGMENTS);
  console.log(`Fetching RNE maires data from: ${url}`);

  const { data: csvText } = await client.getText(url);
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
  /** Register row and current holder judged the same person: the mandate was refreshed. */
  same: number;
  /** A succession: the mandate we held was closed and the new holder created. */
  different: number;
  /** A mayor we already held under another source, now confirmed by the register. */
  adopted: number;
  /** A row the evidence does not let us decide. Nothing was written. */
  undecided: number;
  /** Brand-new profiles: nobody we hold matches this register row. */
  created: number;
  /** Further terms opened on a profile we already hold. No new person is published. */
  newTerms: number;
  /** Mandates Phase 1 closed, so the final report does not have to infer the number. */
  closed: number;
  /** Mandates Phase 1 already ruled on, which Phase 3 must not judge again. */
  handledInPhase1: Set<string>;
  /** One row per undecided commune, for the human who arbitrates them. */
  undecidedRows: UndecidedRow[];
  errors: string[];
}

/** What a human needs to arbitrate one undecided row, without opening a database client. */
type UndecidedRow = {
  inseeCode: string;
  commune: string;
  registre: string;
  base: string;
  raison: string;
};

type ExistingMaire = {
  mandateId: string;
  politicianId: string;
  mandateLocalId: string;
  startDate: Date;
  holder: HolderFacts;
};

/**
 * MandateLocal rows keyed by the INSEE code they were imported under.
 *
 * Split by `isCurrent` on purpose. Only a running occupancy can be the current holder: mixing
 * closed predecessors into that map lets one of them win and triggers an endless chain of
 * successions, a mayor more per run. But the closed ones are not noise either, so they get
 * their own map: 14 396 of our register-sourced mandates are closed, and when the register
 * names that same person again, reopening the mandate is the answer. Creating a profile
 * instead would publish the same mayor twice.
 */
async function loadByInsee(isCurrent: boolean): Promise<Map<string, ExistingMaire>> {
  const existing = new Map<string, ExistingMaire>();

  const rows = await db.mandateLocal.findMany({
    where: {
      rneExternalId: { not: null },
      // MAIRE only: the day another importer stamps an `rneExternalId` on a deputy-mayor's
      // local mandate, this would retitle it "Maire de X" and mark it current.
      mandate: { isCurrent, type: MandateType.MAIRE },
    },
    orderBy: { mandate: { startDate: "desc" } },
    select: {
      id: true,
      rneExternalId: true,
      mandate: {
        select: {
          id: true,
          politicianId: true,
          startDate: true,
          politician: { select: { firstName: true, lastName: true, birthDate: true } },
        },
      },
    },
  });

  for (const local of rows) {
    if (!local.rneExternalId) continue;
    // Most recent first, so the first row wins and later duplicates are ignored.
    if (existing.has(local.rneExternalId)) continue;
    existing.set(local.rneExternalId, {
      mandateId: local.mandate.id,
      politicianId: local.mandate.politicianId,
      mandateLocalId: local.id,
      // Needed by the chronology guard: closing a mandate on a date earlier than its own
      // start would be corrupt data.
      startDate: local.mandate.startDate,
      holder: local.mandate.politician,
    });
  }

  console.log(
    `  Loaded ${existing.size} ${isCurrent ? "current" : "closed"} MandateLocal records by INSEE code`
  );
  return existing;
}

/** A current mayor of a commune, under any source, register included. */
type CommuneIncumbent = {
  mandateId: string;
  mandateLocalId: string;
  startDate: Date;
  holder: HolderFacts;
};

/**
 * Current mayors keyed by commune, so Phase 1 can ask who holds a commune without a query per
 * row. The 2026 municipal results published about 1 300 mayors the register has not caught up
 * with yet; the register is authoritative, so those mandates are adopted rather than doubled.
 */
async function loadCurrentMayorsByCommune(): Promise<Map<string, CommuneIncumbent>> {
  const byCommune = new Map<string, CommuneIncumbent>();

  const rows = await db.mandateLocal.findMany({
    where: {
      communeId: { not: null },
      mandate: { type: MandateType.MAIRE, isCurrent: true },
    },
    orderBy: { mandate: { startDate: "desc" } },
    select: {
      id: true,
      communeId: true,
      mandate: {
        select: {
          id: true,
          startDate: true,
          politician: { select: { firstName: true, lastName: true, birthDate: true } },
        },
      },
    },
  });

  for (const local of rows) {
    if (!local.communeId) continue;
    // A commune holding two current mayors exists in production. Most recent first.
    if (byCommune.has(local.communeId)) continue;
    byCommune.set(local.communeId, {
      mandateId: local.mandate.id,
      mandateLocalId: local.id,
      startDate: local.mandate.startDate,
      holder: local.mandate.politician,
    });
  }

  console.log(`  Loaded ${byCommune.size} current mayors by commune`);
  return byCommune;
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

  // Safe now: this branch only runs when the holder was judged SAME. It used to run on every
  // row matched by INSEE code alone, which wrote the new mayor's civil status onto the old one.
  await db.politician.update({
    where: { id: existing.politicianId },
    data: { civility: row.civility, birthDate: row.birthDate },
  });
}

/**
 * `client` lets a caller run this inside its own transaction. A succession closes the
 * predecessor before creating the successor, and a slug collision or a dropped connection
 * between the two would leave the commune with no mayor at all.
 */
async function createMaire(
  row: ParsedMaireRow,
  verbose: boolean,
  client: DbTransactionClient = db
): Promise<void> {
  const { title, constituency } = mandateLabels(row);

  // Two mayors can share a name. The INSEE suffix keeps the second slug unique.
  const baseSlug = generateSlug(`${row.firstName} ${row.lastName}`);
  const taken = await client.politician.findUnique({
    where: { slug: baseSlug },
    select: { id: true },
  });
  const slug = taken ? `${baseSlug}-${row.inseeCode}` : baseSlug;

  const created = await client.politician.create({
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

/**
 * A further term for someone we already hold, on their existing profile.
 *
 * A mayor re-elected in March 2026 has a closed 2020 mandate on file. Reopening that mandate
 * would overwrite its start date and erase the six years it records; creating a profile would
 * publish them twice. Measured on the register: 1 600 mayors of exactly this shape.
 */
async function createMaireTerm(
  row: ParsedMaireRow,
  politicianId: string,
  client: DbTransactionClient = db
): Promise<void> {
  const { title, constituency } = mandateLabels(row);

  await client.mandate.create({
    data: {
      politicianId,
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
  });
}

/**
 * Write the parsed rows, one commune at a time, collecting failures instead of throwing.
 *
 * The decision of what to do with a row is `decidePhase1Action`, which writes nothing: this
 * loop gathers the evidence, asks, and executes. Every doubt lands on `skip`.
 */
async function upsertMaires(
  rows: ParsedMaireRow[],
  verbose: boolean,
  dryRun: boolean
): Promise<UpsertCounts> {
  const existingByInsee = await loadByInsee(true);
  const closedByInsee = await loadByInsee(false);
  const incumbentByCommune = await loadCurrentMayorsByCommune();
  const counts: UpsertCounts = {
    same: 0,
    different: 0,
    adopted: 0,
    undecided: 0,
    created: 0,
    newTerms: 0,
    closed: 0,
    handledInPhase1: new Set<string>(),
    undecidedRows: [],
    errors: [],
  };

  for (let start = 0; start < rows.length; start += UPSERT_BATCH_SIZE) {
    for (const row of rows.slice(start, start + UPSERT_BATCH_SIZE)) {
      try {
        const incoming: HolderFacts = {
          firstName: row.firstName,
          lastName: row.lastName,
          birthDate: row.birthDate,
        };
        const endDate = row.functionStart ?? mandateStartDate(row);

        const existingMandate = existingByInsee.get(row.inseeCode) ?? null;
        const existingVerdict = existingMandate
          ? compareHolder(incoming, existingMandate.holder)
          : null;

        // A closed mandate for this commune. It never becomes `existingMandate`: assigning it
        // would null out the incumbent lookup below and let an out-of-date register revive a
        // former mayor beside the sitting one.
        const priorTerm = closedByInsee.get(row.inseeCode) ?? null;
        const priorVerdict = priorTerm ? compareHolder(incoming, priorTerm.holder) : null;
        const knownPersonId =
          priorTerm &&
          priorVerdict === "SAME" &&
          isFurtherTerm(priorTerm.startDate, mandateStartDate(row))
            ? priorTerm.politicianId
            : null;

        /** A new profile, or a further term on the profile we already hold. */
        const publish = async (tx: DbTransactionClient = db): Promise<void> => {
          if (knownPersonId) await createMaireTerm(row, knownPersonId, tx);
          else await createMaire(row, verbose, tx);
        };
        const countPublication = (): void => {
          if (knownPersonId) counts.newTerms++;
          else counts.created++;
        };

        // Only consulted when Phase 1 holds no register mandate and the commune resolved:
        // a lookup keyed on a null commune would match any mayor without one, and adopt a
        // stranger at random.
        const incumbent =
          !existingMandate && row.communeId !== null
            ? (incumbentByCommune.get(row.communeId) ?? null)
            : null;

        const action = decidePhase1Action({
          existing:
            existingMandate && existingVerdict
              ? {
                  verdict: existingVerdict,
                  closable: isChronologicallyClosable(existingMandate.startDate, endDate),
                }
              : null,
          hasCommuneId: row.communeId !== null,
          incumbent: incumbent
            ? {
                verdict: compareHolder(incoming, incumbent.holder),
                closable: isChronologicallyClosable(incumbent.startDate, endDate),
              }
            : null,
          priorTerm:
            priorTerm && priorVerdict
              ? {
                  verdict: priorVerdict,
                  furtherTerm: isFurtherTerm(priorTerm.startDate, mandateStartDate(row)),
                }
              : null,
        });

        switch (action) {
          case "update":
            if (!dryRun) await updateExistingMaire(row, existingMandate!);
            counts.same++;
            break;

          case "close-and-create":
            if (!dryRun) {
              // One unit: a failed creation must not leave the commune without a mayor.
              await db.$transaction(async (tx) => {
                await tx.mandate.update({
                  where: { id: existingMandate!.mandateId },
                  data: { isCurrent: false, endDate },
                });
                await publish(tx);
              });
            }
            counts.handledInPhase1.add(existingMandate!.mandateId);
            countPublication();
            counts.different++;
            counts.closed++;
            break;

          case "adopt":
            // No `status` or `lastConfirmedAt` here: this ships before the schema gains them.
            if (!dryRun) {
              await db.mandate.update({
                where: { id: incumbent!.mandateId },
                data: { isCurrent: true, endDate: null },
              });
              await db.mandateLocal.update({
                where: { id: incumbent!.mandateLocalId },
                data: { rneExternalId: row.inseeCode, functionStart: row.functionStart },
              });
            }
            counts.handledInPhase1.add(incumbent!.mandateId);
            counts.adopted++;
            break;

          case "close-incumbent-and-create":
            // The register is authoritative on who is mayor. Leaving this mandate current
            // would publish two mayors for one commune.
            if (!dryRun) {
              await db.$transaction(async (tx) => {
                await tx.mandate.update({
                  where: { id: incumbent!.mandateId },
                  data: { isCurrent: false, endDate },
                });
                await publish(tx);
              });
            }
            counts.handledInPhase1.add(incumbent!.mandateId);
            countPublication();
            counts.closed++;
            break;

          case "new-term":
            if (!dryRun) await createMaireTerm(row, priorTerm!.politicianId);
            counts.newTerms++;
            break;

          case "create":
            if (!dryRun) await createMaire(row, verbose);
            counts.created++;
            break;

          case "skip": {
            // Every doubt lands here and writes nothing. The mandate we hold, if any, is
            // marked as handled so Phase 3 does not judge it again under another rule.
            if (existingMandate) counts.handledInPhase1.add(existingMandate.mandateId);
            if (incumbent) counts.handledInPhase1.add(incumbent.mandateId);
            const held = existingMandate?.holder ?? incumbent?.holder ?? priorTerm?.holder ?? null;
            counts.undecidedRows.push({
              inseeCode: row.inseeCode,
              commune: row.communeLabel ?? "",
              registre: `${row.firstName} ${row.lastName}`,
              base: held ? `${held.firstName ?? ""} ${held.lastName ?? ""}`.trim() : "",
              raison: existingMandate
                ? "mandat du registre"
                : incumbent
                  ? "maire en place"
                  : priorVerdict === "SAME"
                    ? "registre en retard"
                    : "ancien mandat, identité incertaine",
            });
            if (verbose) console.log(`  Indécis ${row.inseeCode}: ${row.lastName}`);
            counts.undecided++;
            break;
          }
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

/** Where the undecided rows are written, so the human stop has a file and not a scrollback. */
const UNDECIDED_CSV_PATH = "data/rne-undecided.csv";

/** Write the undecided rows so they can be sorted, filtered and shared. */
function writeUndecidedCsv(rows: UndecidedRow[]): void {
  const escape = (value: string): string => `"${value.replace(/"/g, '""')}"`;
  const lines = [
    "code_insee,commune,nom_au_registre,nom_en_base,raison",
    ...rows.map((row) =>
      [row.inseeCode, row.commune, row.registre, row.base, row.raison].map(escape).join(",")
    ),
  ];

  try {
    writeFileSync(UNDECIDED_CSV_PATH, `${lines.join("\n")}\n`, "utf8");
    console.log(`  ${rows.length} indécis écrits dans ${UNDECIDED_CSV_PATH}`);
  } catch (error) {
    // A read-only filesystem is not a reason to fail a sync.
    console.error(`  Impossible d'écrire ${UNDECIDED_CSV_PATH}: ${error}`);
  }
}

/** The numbers Phase 1 reports, in the order a human reads them. */
function logPhase1Counts(counts: UpsertCounts, dryRun: boolean): void {
  const prefix = dryRun ? "  [DRY-RUN]" : " ";
  console.log(`${prefix} Même titulaire (SAME):     ${counts.same}`);
  console.log(`${prefix} Succession (DIFFERENT):    ${counts.different}`);
  console.log(`${prefix} Indécis (UNDECIDED):       ${counts.undecided}`);
  console.log(`${prefix} Adoptions:                 ${counts.adopted}`);
  console.log(`${prefix} Fiches créées:             ${counts.created}`);
  console.log(`${prefix} Mandats sur fiche connue:  ${counts.newTerms}`);
  console.log(`${prefix} Erreurs:                   ${counts.errors.length}`);
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
  seenCommuneIds: Set<string>,
  handledInPhase1: Set<string>,
  dryRun: boolean
): Promise<{ closed: number; errors: string[] }> {
  console.log("\n--- Phase 3: Close stale mandates ---");

  const stale = snapshot.filter((mandate) => {
    // Phase 1 already ruled on this mandate, doubts included. Redundant today, since a
    // mandate Phase 1 judged has its identifier in `seenCommuneIds` and the next line already
    // excludes it. Kept as a belt: the two exclusions rest on different facts, and the day
    // Phase 3 stops keying on the commune this is the one that still holds.
    if (handledInPhase1.has(mandate.id)) return false;
    const identifier = mandate.localData?.rneExternalId || mandate.localData?.communeId;
    return identifier && !seenCommuneIds.has(identifier);
  });

  console.log(`  Found ${stale.length} stale mandates to close`);

  const errors: string[] = [];
  let closed = 0;

  for (const mandate of stale) {
    try {
      if (!dryRun) {
        await db.mandate.update({
          where: { id: mandate.id },
          data: { isCurrent: false, endDate: new Date() },
        });
      }
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
  assertRNEReadOnly(dryRun);

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

  if (dryRun && verbose) {
    for (const row of parsed.rows.slice(0, 10)) {
      console.log(`  [DRY-RUN] ${row.fullName} (${row.inseeCode})`);
    }
  }

  // Phase 1 reads the same evidence and takes the same decisions in both modes; only the
  // writes are suppressed. A dry run whose branching differed from the real one would not
  // measure anything.
  const upserted = await upsertMaires(parsed.rows, verbose, dryRun);
  errors.push(...upserted.errors);
  logPhase1Counts(upserted, dryRun);
  if (upserted.undecidedRows.length > 0) writeUndecidedCsv(upserted.undecidedRows);

  // Phase 2 folds the stubs Phase 1 just created into the politicians we already knew. A dry
  // run created none, so there is nothing to fold and the resolver would run on the previous
  // import's leftovers.
  const reconciled = dryRun
    ? { matched: 0, notFound: 0, errors: [] as string[] }
    : await reconcileRNEStubs(parsed.communeNameByInsee, verbose);
  errors.push(...reconciled.errors);

  // A limited run has only read a slice of the register, so it cannot tell a commune that left
  // the file from one that sits past the limit.
  const closed = shouldRunStaleSweep({ limit })
    ? await closeStaleMandates(snapshot, parsed.seenCommuneIds, upserted.handledInPhase1, dryRun)
    : { closed: 0, errors: [] as string[] };
  errors.push(...closed.errors);

  if (!shouldRunStaleSweep({ limit })) {
    console.log("\n--- Phase 3 ignorée : aperçu limité, le fichier lu est tronqué ---");
  }

  console.log(`\n${"=".repeat(50)}`);
  console.log(dryRun ? "Results (DRY-RUN, aucune écriture) :" : "Results:");
  console.log(`  Maires same:       ${upserted.same}`);
  console.log(`  Maires different:  ${upserted.different}`);
  console.log(`  Maires undecided:  ${upserted.undecided}`);
  console.log(`  Maires adopted:    ${upserted.adopted}`);
  console.log(`  Fiches créées:     ${upserted.created}`);
  console.log(`  Mandats sur fiche connue: ${upserted.newTerms}`);
  console.log(`  Mandates closed:   ${upserted.closed + closed.closed}`);
  console.log(`  Politicians matched: ${reconciled.matched}`);
  console.log(`  Politicians not found: ${reconciled.notFound}`);
  console.log(`  Errors: ${errors.length}`);

  if (!dryRun) {
    // What actually changed. Counting `same` too would announce 21 000 untouched mayors as an
    // update on every run.
    await recordPlatformUpdate(upserted.created + upserted.newTerms + upserted.adopted);
  }

  return {
    success: errors.length === 0,
    // People, not mandates: a further term on a profile we already hold creates nobody.
    officialsCreated: upserted.created,
    officialsUpdated: upserted.same + upserted.adopted,
    officialsClosed: upserted.closed + closed.closed,
    mandatesCreated: upserted.created + upserted.newTerms,
    mandatesUpdated: upserted.same + upserted.adopted,
    mandatesClosed: upserted.closed + closed.closed,
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
  // This separate writer also associates people with a commune code, without checking identity.
  assertRNEReadOnly(false);
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
