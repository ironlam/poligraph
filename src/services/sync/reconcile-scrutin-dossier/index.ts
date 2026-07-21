/**
 * Reconciliation service: links Scrutin → LegislativeDossier via shared session references.
 *
 * The AN open data has no direct scrutin→dossier FK. However:
 * - Dossier JSON contains nested `actesLegislatifs` with `reunionRef` (debate sessions)
 *   and `voteRefs` (authoritative anchor to a specific scrutin).
 * - Scrutin JSON contains `seanceRef` (the session where the vote occurred).
 *
 * This service downloads both ZIPs, builds the resolver maps (Task 2/3), then
 * computes a per-scrutin transition (NEW_LINK/REPOINT/CLEAR/KEEP/NOOP) and
 * returns it. This is self-healing: previously-wrong links (REPOINT) are
 * corrected, not just missing links (NEW_LINK) filled in. Plan-only: this
 * module writes nothing to dossierLegislatifId itself. The caller's Phase A
 * (repairScrutinDossier, see ./remediate) is the sole writer, atomically with
 * the title STALE transition.
 */

import * as fs from "fs";
import * as https from "https";
import { createWriteStream, mkdirSync, rmSync, readdirSync, readFileSync } from "fs";
import { extractZip } from "@/lib/parsing/unzip";
import { parseDossierJson, buildDossierMaps, type ParsedDossier, type ResolverMaps } from "./maps";
import { resolveScrutinDossier } from "./resolve";
import type {
  ReconcileOptions,
  ReconciliationResult,
  ScrutinDossierTransition,
  Action,
} from "./types";

const LEGISLATURE = 17;
const TEMP_DIR = "/tmp/reconcile-scrutin-dossier";

const DOSSIER_ZIP_URL = `https://data.assemblee-nationale.fr/static/openData/repository/${LEGISLATURE}/loi/dossiers_legislatifs/Dossiers_Legislatifs.json.zip`;
const SCRUTIN_ZIP_URL = `https://data.assemblee-nationale.fr/static/openData/repository/${LEGISLATURE}/loi/scrutins/Scrutins.json.zip`;

// ---------------------------------------------------------------------------
// AN JSON types (minimal, just what we need)
// ---------------------------------------------------------------------------

interface ANScrutinMinimal {
  scrutin: {
    uid: string;
    seanceRef?: string | null;
  };
}

// ---------------------------------------------------------------------------
// Download helpers (unchanged from the previous flat-file implementation)
// ---------------------------------------------------------------------------

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    https
      .get({ hostname: urlObj.hostname, path: urlObj.pathname + urlObj.search }, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            downloadFile(redirectUrl, dest).then(resolve).catch(reject);
            return;
          }
        }
        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode} for ${url}`));
          return;
        }
        const file = createWriteStream(dest);
        response.pipe(file);
        file.on("finish", () => {
          file.close();
          resolve();
        });
      })
      .on("error", (err) => {
        if (fs.existsSync(dest)) fs.unlinkSync(dest);
        reject(err);
      });
  });
}

// ---------------------------------------------------------------------------
// Pure decision core (unit-tested without network or DB)
// ---------------------------------------------------------------------------

export interface ScrutinRow {
  scrutinId: string;
  externalId: string;
  seanceRef: string | null;
  title: string;
  previousDossierId: string | null;
}

/** Pure: turn resolver outcomes + current state + policy into transitions. */
export function computeTransitions(
  scrutins: ScrutinRow[],
  maps: ResolverMaps,
  dossierIdByExt: Map<string, string>,
  opts: ReconcileOptions
): ScrutinDossierTransition[] {
  const out: ScrutinDossierTransition[] = [];
  for (const s of scrutins) {
    const r = resolveScrutinDossier(
      { uid: s.externalId, seanceRef: s.seanceRef, title: s.title },
      maps
    );
    // Map external id -> DB id; absent-from-DB is treated as unresolved.
    const resolvedDossierId = r.resolvedDossierExternalId
      ? (dossierIdByExt.get(r.resolvedDossierExternalId) ?? null)
      : null;

    let action: Action;
    let appliedDossierId: string | null;
    if (resolvedDossierId !== null) {
      if (s.previousDossierId === null) action = "NEW_LINK";
      else if (s.previousDossierId !== resolvedDossierId) action = "REPOINT";
      else action = "NOOP";
      appliedDossierId = resolvedDossierId;
    } else {
      // resolvedDossierId is null: AMBIGUOUS or UNMATCHED.
      if (s.previousDossierId !== null && r.resolution === "AMBIGUOUS" && opts.applyClears) {
        action = "CLEAR";
        appliedDossierId = null;
      } else if (s.previousDossierId !== null) {
        action = "KEEP"; // never destructively clear on daily / non-ambiguous
        appliedDossierId = s.previousDossierId;
      } else {
        action = "NOOP";
        appliedDossierId = null;
      }
    }

    out.push({
      scrutinId: s.scrutinId,
      externalId: s.externalId,
      previousDossierId: s.previousDossierId,
      resolvedDossierId,
      resolution: r.resolution,
      appliedDossierId,
      action,
      bestScore: r.bestScore,
      margin: r.margin,
      candidateExternalIds: r.candidateExternalIds,
      candidateScores: r.candidateScores,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function reconcileScrutinDossier(
  opts: ReconcileOptions
): Promise<ReconciliationResult> {
  // Imported lazily (not at module top-level) so this module stays importable
  // for the pure computeTransitions unit test without a DATABASE_URL.
  const { db } = await import("@/lib/db");

  // 1. Setup temp directory
  if (fs.existsSync(TEMP_DIR)) rmSync(TEMP_DIR, { recursive: true });
  mkdirSync(TEMP_DIR, { recursive: true });

  try {
    // 2. Download and extract dossier ZIP
    console.log("[reconcile] Downloading dossier ZIP...");
    const dossierZip = `${TEMP_DIR}/dossiers.zip`;
    await downloadFile(DOSSIER_ZIP_URL, dossierZip);
    extractZip(dossierZip, `${TEMP_DIR}/dossiers/`);

    // 3. Parse dossiers and build the resolver maps
    console.log("[reconcile] Parsing dossiers and building resolver maps...");
    const dossierDir = `${TEMP_DIR}/dossiers/json/dossierParlementaire`;
    if (!fs.existsSync(dossierDir)) {
      throw new Error("Cannot find dossier JSON files after extraction");
    }

    const dossierFiles = readdirSync(dossierDir).filter((f) => f.endsWith(".json"));
    const parsedDossiers: ParsedDossier[] = [];
    for (const file of dossierFiles) {
      try {
        const raw = JSON.parse(readFileSync(`${dossierDir}/${file}`, "utf-8"));
        const parsed = parseDossierJson(raw);
        if (parsed) parsedDossiers.push(parsed);
      } catch {
        // Skip malformed files
      }
    }
    const maps = buildDossierMaps(parsedDossiers);
    console.log(`[reconcile] Parsed ${parsedDossiers.length} dossiers`);

    // 4. Download and extract scrutin ZIP
    console.log("[reconcile] Downloading scrutin ZIP...");
    const scrutinZip = `${TEMP_DIR}/scrutins.zip`;
    await downloadFile(SCRUTIN_ZIP_URL, scrutinZip);
    extractZip(scrutinZip, `${TEMP_DIR}/scrutins/`);

    // 5. Build scrutinExternalId → seanceRef map from the AN scrutin ZIP
    console.log("[reconcile] Reading scrutin seanceRefs...");
    const seanceRefByExtId = new Map<string, string | null>();
    const scrutinDir = `${TEMP_DIR}/scrutins/json`;
    const scrutinFiles = readdirSync(scrutinDir).filter((f) => f.endsWith(".json"));
    for (const file of scrutinFiles) {
      try {
        const raw = readFileSync(`${scrutinDir}/${file}`, "utf-8");
        const data = JSON.parse(raw) as ANScrutinMinimal;
        const uid = data.scrutin?.uid;
        if (!uid) continue;
        seanceRefByExtId.set(uid, data.scrutin?.seanceRef ?? null);
      } catch {
        // Skip malformed files
      }
    }
    console.log(`[reconcile] Read ${seanceRefByExtId.size} scrutin seanceRefs`);

    // 6. Load DB mappings
    const dbDossiers = await db.legislativeDossier.findMany({
      select: { id: true, externalId: true },
    });
    const dossierIdByExt = new Map(dbDossiers.map((d) => [d.externalId, d.id]));

    const dbScrutins = await db.scrutin.findMany({
      select: { id: true, externalId: true, dossierLegislatifId: true, title: true },
    });

    // 7. Build scrutin rows and compute transitions
    const rows: ScrutinRow[] = dbScrutins.map((s) => ({
      scrutinId: s.id,
      externalId: s.externalId,
      seanceRef: seanceRefByExtId.get(s.externalId) ?? null,
      title: s.title,
      previousDossierId: s.dossierLegislatifId,
    }));

    const transitions = computeTransitions(rows, maps, dossierIdByExt, opts);
    const appliedTransitions = transitions.filter(
      (t) => t.action === "NEW_LINK" || t.action === "REPOINT" || t.action === "CLEAR"
    );

    console.log(
      `[reconcile] Evaluated ${transitions.length} scrutins, applied ${appliedTransitions.length} transitions`
    );

    return {
      evaluatedCount: transitions.length,
      decisions: transitions,
      appliedTransitions,
      repairRunId: opts.repairRunId,
    };
  } finally {
    // Cleanup
    if (fs.existsSync(TEMP_DIR)) {
      rmSync(TEMP_DIR, { recursive: true });
    }
  }
}
