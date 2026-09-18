/**
 * CLI script to sync legislative dossiers from data.assemblee-nationale.fr
 *
 * Usage:
 *   npm run sync:legislation              # Full sync (17th legislature)
 *   npm run sync:legislation -- --leg=17  # Sync specific legislature
 *   npm run sync:legislation -- --stats   # Show current stats
 *   npm run sync:legislation -- --active  # Only sync active dossiers
 *   npm run sync:legislation -- --today   # Only process dossiers modified today
 *
 * Data source: data.assemblee-nationale.fr (official Open Data)
 */

import "dotenv/config";
import { createCLI, type SyncHandler, type SyncResult } from "../src/lib/sync";
import { db } from "../src/lib/db";
import { generateDateSlug } from "../src/lib/utils";
import { DataSource, DossierStatus, Prisma } from "../src/generated/prisma";
import type { DossierTimelineEntry } from "../src/types/legislation";
import * as fs from "fs";
import * as path from "path";
import { createHash } from "node:crypto";
import { mkdirSync, rmSync, readdirSync, readFileSync } from "fs";
import { execSync } from "child_process";
import { downloadFileWithRetry } from "../src/lib/download-file";
import { classifyDossierOrigin } from "../src/lib/legislation/origine";

// Configuration
const DEFAULT_LEGISLATURE = 17;
const TEMP_DIR = "/tmp/dossiers-legislatifs-an";
const ZIP_URL_TEMPLATE =
  "https://data.assemblee-nationale.fr/static/openData/repository/{leg}/loi/dossiers_legislatifs/Dossiers_Legislatifs.json.zip";

// Category mapping based on procedureParlementaire.libelle
const CATEGORY_MAPPING: Record<string, string> = {
  "Projet de loi de finances": "Budget",
  "Projet de loi de financement de la sécurité sociale": "Santé",
  "Proposition de loi ordinaire": "Législation",
  "Projet de loi ordinaire": "Législation",
  "Projet ou proposition de loi organique": "Institutionnel",
  "Projet ou proposition de loi constitutionnelle": "Constitution",
  "Projet de ratification des traités et conventions": "International",
  "Commission d'enquête": "Contrôle",
  "Mission d'information": "Information",
  "Rapport d'information": "Information",
  "Rapport d'information sans mission": "Information",
};

// Progress tracking
const isTTY = process.stdout.isTTY === true;
let lastMessageLength = 0;

function updateLine(message: string): void {
  if (isTTY) {
    process.stdout.write(`\r\x1b[K${message}`);
  } else {
    const padding = " ".repeat(Math.max(0, lastMessageLength - message.length));
    process.stdout.write(`\r${message}${padding}`);
  }
  lastMessageLength = message.length;
}

function renderProgressBar(current: number, total: number, width: number = 30): string {
  const percent = Math.round((current / total) * 100);
  const filled = Math.round((current / total) * width);
  const empty = width - filled;
  const bar = "█".repeat(filled) + "░".repeat(empty);
  return `[${bar}] ${percent}%`;
}

/**
 * AN dossier JSON structure
 */
interface ANDossier {
  dossierParlementaire: {
    "@xsi:type": string;
    uid: string;
    legislature: string;
    titreDossier: {
      titre: string;
      titreChemin: string;
      senatChemin?: string | null;
    };
    procedureParlementaire: {
      code: string;
      libelle: string;
    };
    initiateur?: {
      acteurs?: {
        acteur: ANActeur | ANActeur[];
      };
    } | null;
    actesLegislatifs?: {
      acteLegislatif: ANActe | ANActe[];
    } | null;
    fusionDossier?: string | null;
  };
}

interface ANActeur {
  acteurRef: string;
  mandatRef: string;
}

interface ANActe {
  "@xsi:type": string;
  uid: string;
  codeActe: string;
  libelleActe: {
    nomCanonique: string;
    libelleCourt?: string;
  };
  organeRef: string;
  dateActe: string | null;
  actesLegislatifs?: {
    acteLegislatif: ANActe | ANActe[];
  } | null;
  texteAssocie?: string;
  texteAdopte?: string;
}

/**
 * Recursively find all codeActe in a dossier
 */
function findAllCodes(actes: ANActe | ANActe[] | undefined | null): string[] {
  if (!actes) return [];

  const acteArray = Array.isArray(actes) ? actes : [actes];
  const codes: string[] = [];

  for (const acte of acteArray) {
    codes.push(acte.codeActe);
    if (acte.actesLegislatifs?.acteLegislatif) {
      codes.push(...findAllCodes(acte.actesLegislatifs.acteLegislatif));
    }
  }

  return codes;
}

/**
 * Recursively find the first texteAssocie reference in a dossier's acts.
 * Kept separate from origin provenance because legislation-content depends
 * on the historical behavior of this field.
 */
function findFirstDocumentRef(actes: ANActe | ANActe[] | undefined | null): string | null {
  if (!actes) return null;

  const acteArray = Array.isArray(actes) ? actes : [actes];

  for (const acte of acteArray) {
    if (acte.texteAssocie) {
      return acte.texteAssocie;
    }
    if (acte.actesLegislatifs?.acteLegislatif) {
      const found = findFirstDocumentRef(acte.actesLegislatifs.acteLegislatif);
      if (found) return found;
    }
  }

  return null;
}

/**
 * Recursively find all dates in a dossier
 */
function findAllDates(actes: ANActe | ANActe[] | undefined | null): Date[] {
  if (!actes) return [];

  const acteArray = Array.isArray(actes) ? actes : [actes];
  const dates: Date[] = [];

  for (const acte of acteArray) {
    if (acte.dateActe) {
      try {
        const d = new Date(acte.dateActe);
        if (!isNaN(d.getTime())) {
          dates.push(d);
        }
      } catch {
        // Ignore invalid dates
      }
    }
    if (acte.actesLegislatifs?.acteLegislatif) {
      dates.push(...findAllDates(acte.actesLegislatifs.acteLegislatif));
    }
  }

  return dates;
}

/**
 * Infer chamber from act code prefix
 */
function inferChamber(code: string): string {
  if (code.startsWith("ANL") || code.startsWith("AN1") || code.startsWith("AN2")) return "AN";
  if (code.startsWith("SNL") || code.startsWith("SN1") || code.startsWith("SN2")) return "SENAT";
  if (code.startsWith("CMP")) return "CMP";
  if (code.startsWith("CC")) return "CC";
  if (code.startsWith("PROM")) return "GOV";
  if (code.includes("DEPOT") || code.includes("COM-FOND") || code.includes("COM-AVIS")) return "AN";
  if (code.includes("DEBATS")) return "AN";
  return "UNKNOWN";
}

/**
 * Recursively build timeline from actesLegislatifs tree
 */
function buildTimeline(actes: ANActe | ANActe[] | undefined | null): DossierTimelineEntry[] {
  if (!actes) return [];
  const acteArray = Array.isArray(actes) ? actes : [actes];
  const entries: DossierTimelineEntry[] = [];
  for (const acte of acteArray) {
    const entry: DossierTimelineEntry = {
      code: acte.codeActe,
      label: acte.libelleActe?.nomCanonique || acte.codeActe,
      date: acte.dateActe || null,
      chamber: inferChamber(acte.codeActe),
    };
    if (acte.actesLegislatifs?.acteLegislatif) {
      const children = buildTimeline(acte.actesLegislatifs.acteLegislatif);
      if (children.length > 0) {
        entry.children = children;
      }
    }
    entries.push(entry);
  }
  return entries;
}

async function resolveAuthors(
  dossierId: string,
  initiateur: ANDossier["dossierParlementaire"]["initiateur"]
): Promise<void> {
  if (!initiateur?.acteurs?.acteur) return;

  const acteurs = Array.isArray(initiateur.acteurs.acteur)
    ? initiateur.acteurs.acteur
    : [initiateur.acteurs.acteur];

  for (const acteur of acteurs) {
    const ext = await db.externalId.findFirst({
      where: {
        source: DataSource.ASSEMBLEE_NATIONALE,
        externalId: acteur.acteurRef,
        politicianId: { not: null },
      },
      select: { politicianId: true },
    });
    if (!ext?.politicianId) continue;

    await db.dossierAuthor.upsert({
      where: {
        dossierId_politicianId_role: {
          dossierId,
          politicianId: ext.politicianId,
          role: "AUTEUR",
        },
      },
      update: { acteurRef: acteur.acteurRef, chamber: "AN" },
      create: {
        dossierId,
        politicianId: ext.politicianId,
        acteurRef: acteur.acteurRef,
        role: "AUTEUR",
        chamber: "AN",
      },
    });
  }
}

/**
 * Determine dossier status from actes
 */
function determineStatus(codes: string[], legislature?: number): DossierStatus {
  // Check for promulgation (adopted)
  if (codes.some((c) => c === "PROM" || c === "PROM-PUB")) {
    return "ADOPTE";
  }

  // Check for rejection indicators
  if (codes.some((c) => c.includes("REJET"))) {
    return "REJETE";
  }

  // Check for withdrawal
  if (codes.some((c) => c.includes("RETRAIT") || c.includes("RETIRE"))) {
    return "RETIRE";
  }

  // Conseil constitutionnel (saisine without promulgation = pending CC review)
  if (codes.some((c) => c.startsWith("CC-SAISIE"))) {
    return "CONSEIL_CONSTITUTIONNEL";
  }

  // Caduque: previous legislature dossiers that were never adopted
  if (legislature && legislature < DEFAULT_LEGISLATURE) {
    return "CADUQUE";
  }

  // Debates/sessions or CMP = actively discussed in hemicycle
  const hasDebates = codes.some(
    (c) =>
      c.includes("DEBATS-SEANCE") ||
      c.includes("DEBATS-DEC") ||
      c.startsWith("CMP") ||
      c.startsWith("ANLUNI") ||
      c.startsWith("ANLDEF") ||
      c.startsWith("SNLDEF")
  );
  if (hasDebates) {
    return "EN_COURS";
  }

  // Committee report exists but no hemicycle session yet
  const hasCommitteeReport = codes.some(
    (c) => c.includes("COM-FOND-RAPPORT") || c.includes("COM-AVIS-RAPPORT")
  );
  if (hasCommitteeReport) {
    return "EN_COMMISSION";
  }

  // RTRINI = "Retrait d'une initiative" — only mark RETIRE if no debates followed
  // (during active discussion, RTRINI indicates a partial retrait, not full withdrawal)
  if (codes.some((c) => c.includes("RTRINI"))) {
    return "RETIRE";
  }

  // Default: filed but not yet examined
  return "DEPOSE";
}

/**
 * Generate short title from full title
 */
function generateShortTitle(title: string): string {
  // Remove common prefixes
  let short = title
    .replace(/^Projet de loi /i, "")
    .replace(/^Proposition de loi /i, "")
    .replace(/^(relatif|relative) (à|au|aux|à la|à l') /i, "")
    .replace(/^(portant|visant à) /i, "")
    .replace(/^(pour|sur) (le|la|les|l') /i, "");

  // Capitalize first letter
  short = short.charAt(0).toUpperCase() + short.slice(1);

  // Truncate if too long
  if (short.length > 100) {
    short = short.substring(0, 97) + "...";
  }

  return short;
}

/**
 * Extract dossier number (PJL/PPL number)
 */
function extractNumber(dossier: ANDossier): string | null {
  const type = dossier.dossierParlementaire["@xsi:type"];
  const uid = dossier.dossierParlementaire.uid;
  const procedure = dossier.dossierParlementaire.procedureParlementaire?.libelle || "";

  // Extract number from UID: DLR5L17N50426 -> 50426
  const match = uid.match(/N(\d+)$/);
  if (!match) return null;

  const num = match[1]!;

  // Determine prefix based on procedure
  if (procedure.toLowerCase().includes("projet")) {
    return `PJL ${num}`;
  } else if (procedure.toLowerCase().includes("proposition")) {
    return `PPL ${num}`;
  }

  return num;
}

/**
 * Get category from procedure
 */
function getCategory(procedure: string): string | null {
  return CATEGORY_MAPPING[procedure] || null;
}

/**
 * Generate a unique slug for a dossier
 */
async function generateUniqueDossierSlug(date: Date | null, title: string): Promise<string> {
  const baseSlug = generateDateSlug(date, title);

  // Check if slug already exists
  const existing = await db.legislativeDossier.findUnique({ where: { slug: baseSlug } });
  if (!existing) return baseSlug;

  // Try with suffix
  let counter = 2;
  while (counter < 100) {
    const suffix = `-${counter}`;
    const maxBaseLength = 80 - suffix.length;
    const truncatedBase = baseSlug.slice(0, maxBaseLength).replace(/-$/, "");
    const slugWithSuffix = `${truncatedBase}${suffix}`;

    const existsWithSuffix = await db.legislativeDossier.findUnique({
      where: { slug: slugWithSuffix },
    });
    if (!existsWithSuffix) return slugWithSuffix;

    counter++;
  }

  // Fallback: use timestamp
  return `${baseSlug.slice(0, 60)}-${Date.now()}`;
}

/**
 * Main sync function
 */
async function syncLegislation(
  legislature: number = DEFAULT_LEGISLATURE,
  options: {
    dryRun?: boolean;
    originOnly?: boolean;
    limit?: number;
    activeOnly?: boolean;
    todayOnly?: boolean;
    sinceDays?: number;
  } = {}
) {
  const {
    dryRun = false,
    originOnly = false,
    limit,
    activeOnly = false,
    todayOnly = false,
    sinceDays,
  } = options;
  const stats = {
    dossiersProcessed: 0,
    dossiersCreated: 0,
    dossiersUpdated: 0,
    dossiersWouldUpdate: 0,
    dossiersSkipped: 0,
    dossiersActive: 0,
    byStatus: {
      DEPOSE: 0,
      EN_COMMISSION: 0,
      EN_COURS: 0,
      CONSEIL_CONSTITUTIONNEL: 0,
      ADOPTE: 0,
      REJETE: 0,
      RETIRE: 0,
      CADUQUE: 0,
    } as Record<string, number>,
    byCategory: {} as Record<string, number>,
    errors: [] as string[],
  };

  // Phase timings (ms) + file counts, surfaced in the final summary line.
  const timings: Record<string, number> = {};
  let totalJsonFiles = 0;
  let legFilteredFiles = 0;

  try {
    // Step 1: Download ZIP
    updateLine("Downloading dossiers ZIP from data.assemblee-nationale.fr...");
    const zipUrl = ZIP_URL_TEMPLATE.replace("{leg}", String(legislature));
    const zipPath = path.join(TEMP_DIR, "dossiers.zip");

    // Clean and create temp dir
    if (fs.existsSync(TEMP_DIR)) {
      rmSync(TEMP_DIR, { recursive: true });
    }
    mkdirSync(TEMP_DIR, { recursive: true });

    let t = Date.now();
    await downloadFileWithRetry(zipUrl, zipPath);
    const originFetchedAt = new Date();
    timings.download = Date.now() - t;
    console.log(`\n✓ Downloaded ZIP file (${timings.download}ms)`);

    // Step 2: Extract ZIP
    updateLine("Extracting ZIP...");
    t = Date.now();
    execSync(`unzip -o "${zipPath}" -d "${TEMP_DIR}"`, { stdio: "pipe" });
    timings.unzip = Date.now() - t;
    console.log(`✓ Extracted ZIP file (${timings.unzip}ms)`);

    // Step 3: List JSON files
    const jsonDir = path.join(TEMP_DIR, "json", "dossierParlementaire");
    if (!fs.existsSync(jsonDir)) {
      throw new Error(`Directory not found: ${jsonDir}`);
    }

    t = Date.now();
    let jsonFiles = readdirSync(jsonDir).filter((f) => f.endsWith(".json"));
    totalJsonFiles = jsonFiles.length;

    // Filter by legislature if needed (some ZIPs contain multiple legislatures)
    if (!originOnly) {
      jsonFiles = jsonFiles.filter((f) => f.includes(`L${legislature}`));
    }
    legFilteredFiles = jsonFiles.length;

    if (limit) {
      jsonFiles = jsonFiles.slice(0, limit);
    }
    timings.listing = Date.now() - t;

    const total = jsonFiles.length;
    console.log(
      `Found ${totalJsonFiles} JSON, ${legFilteredFiles} for L${legislature}, processing ${total}\n`
    );

    const processStart = Date.now();

    // Step 4: Process each dossier
    for (let i = 0; i < jsonFiles.length; i++) {
      const file = jsonFiles[i];
      const progressMsg = `${renderProgressBar(i + 1, total)} Processing ${i + 1}/${total}`;

      if ((i + 1) % 50 === 0 || i === 0 || i === jsonFiles.length - 1) {
        updateLine(progressMsg);
      }

      try {
        const filePath = path.join(jsonDir, file!);
        const content = readFileSync(filePath, "utf-8");

        // Skip empty files
        if (!content.trim()) {
          stats.dossiersSkipped++;
          continue;
        }

        const data: ANDossier = JSON.parse(content);
        const dp = data.dossierParlementaire;

        // Skip non-legislative dossiers (missions, rapports, etc.)
        const type = dp["@xsi:type"] ?? ""; // malformed dossiers lack @xsi:type → skip cleanly, don't crash
        if (
          !type.includes("Legislatif") &&
          !type.includes("Loi") &&
          type !== "DossierLegislatif_Type"
        ) {
          stats.dossiersSkipped++;
          continue;
        }

        const externalId = dp.uid;
        const title = dp.titreDossier?.titre || "Sans titre";
        const origin = classifyDossierOrigin(dp);
        const sourceHash = createHash("sha256").update(content).digest("hex");
        const shortTitle = generateShortTitle(title);
        const number = extractNumber(data);
        const procedure = dp.procedureParlementaire?.libelle || "";
        const category = getCategory(procedure);

        // Preserve the legacy expose source independently of origin
        // provenance. legislation-content still relies on this field.
        const documentExternalId = findFirstDocumentRef(dp.actesLegislatifs?.acteLegislatif);

        // Find all codes to determine status
        const allCodes = findAllCodes(dp.actesLegislatifs?.acteLegislatif);
        const dossierLeg = parseInt(dp.legislature, 10) || legislature;
        const status = determineStatus(allCodes, dossierLeg);

        // Skip non-active if activeOnly
        const activeStatuses: DossierStatus[] = [
          "DEPOSE",
          "EN_COMMISSION",
          "EN_COURS",
          "CONSEIL_CONSTITUTIONNEL",
        ];
        if (!originOnly && activeOnly && !activeStatuses.includes(status)) {
          stats.dossiersSkipped++;
          continue;
        }
        stats.dossiersActive++;

        // Find dates (needed for date filters and filingDate/adoptionDate)
        const allDates = findAllDates(dp.actesLegislatifs?.acteLegislatif).sort(
          (a, b) => a.getTime() - b.getTime()
        );
        // Incremental window: skip dossiers whose most recent act date is older
        // than `sinceDays` days. Cheap, robust way to keep the daily run short
        // (only re-touch dossiers that actually moved recently).
        if (!originOnly && sinceDays !== undefined && allDates.length > 0) {
          const cutoff = Date.now() - sinceDays * 24 * 60 * 60 * 1000;
          if (allDates[allDates.length - 1]!.getTime() < cutoff) {
            stats.dossiersSkipped++;
            continue;
          }
        }
        // Filter by today: only process dossiers whose most recent date is today
        if (!originOnly && todayOnly && allDates.length > 0) {
          const today = new Date().toISOString().split("T")[0];
          const mostRecent = allDates[allDates.length - 1]!.toISOString().split("T")[0];
          if (mostRecent !== today) {
            stats.dossiersSkipped++;
            continue;
          }
        }

        const filingDate = allDates.length > 0 ? allDates[0] : null;
        const adoptionDate =
          status === "ADOPTE" && allDates.length > 0 ? allDates[allDates.length - 1] : null;

        // Source URL
        const sourceUrl = `https://www.assemblee-nationale.fr/dyn/${legislature}/dossiers/${dp.titreDossier?.titreChemin || externalId}`;

        const senatChemin = dp.titreDossier?.senatChemin;
        const senatUrl = senatChemin
          ? senatChemin.startsWith("http")
            ? senatChemin
            : `https://www.senat.fr/dossier-legislatif/${senatChemin}.html`
          : null;

        // Build timeline from acts tree
        const timeline = buildTimeline(dp.actesLegislatifs?.acteLegislatif);

        // Update stats
        stats.byStatus[status] = (stats.byStatus[status] || 0) + 1;
        if (category) {
          stats.byCategory[category] = (stats.byCategory[category] || 0) + 1;
        }

        if (originOnly) {
          const existing = await db.legislativeDossier.findUnique({
            where: { externalId },
            select: { id: true },
          });
          if (!existing) {
            stats.dossiersSkipped++;
            continue;
          }

          const originEvidence =
            origin.originEvidence || origin.candidateDocumentRefs.length > 0
              ? ({
                  initialDeposit: origin.originEvidence,
                  candidateDocumentRefs: origin.candidateDocumentRefs,
                } as Prisma.InputJsonValue)
              : Prisma.DbNull;
          if (dryRun) {
            stats.dossiersWouldUpdate++;
          } else {
            await db.legislativeDossier.update({
              where: { id: existing.id },
              data: {
                origin: origin.origin,
                originDocumentRef: origin.originDocumentRef,
                originReason: origin.originReason,
                originEvidence,
                originSourceHash: sourceHash,
                originSourceUrl: zipUrl,
                originFetchedAt,
              },
            });
            stats.dossiersUpdated++;
          }
          stats.dossiersProcessed++;
          continue;
        }

        if (!dryRun) {
          // Upsert dossier
          const existing = await db.legislativeDossier.findUnique({
            where: { externalId },
          });

          const dossierData = {
            externalId,
            title,
            shortTitle,
            number,
            status,
            category,
            filingDate,
            adoptionDate,
            sourceUrl,
            senatUrl,
            documentExternalId,
            timeline:
              timeline.length > 0 ? (timeline as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
            origin: origin.origin,
            originDocumentRef: origin.originDocumentRef,
            originReason: origin.originReason,
            originEvidence:
              origin.originEvidence || origin.candidateDocumentRefs.length > 0
                ? ({
                    initialDeposit: origin.originEvidence,
                    candidateDocumentRefs: origin.candidateDocumentRefs,
                  } as Prisma.InputJsonValue)
                : Prisma.DbNull,
            originSourceHash: sourceHash,
            originSourceUrl: zipUrl,
            originFetchedAt,
          };

          let dossierId: string;
          if (existing) {
            // Update existing dossier, generate slug if missing
            const updateData: typeof dossierData & { slug?: string } = { ...dossierData };
            if (!existing.slug) {
              updateData.slug = await generateUniqueDossierSlug(filingDate!, shortTitle || title);
            }
            await db.legislativeDossier.update({
              where: { id: existing.id },
              data: updateData,
            });
            dossierId = existing.id;
            stats.dossiersUpdated++;
          } else {
            // Create new dossier with slug
            const slug = await generateUniqueDossierSlug(filingDate!, shortTitle || title);
            const created = await db.legislativeDossier.create({
              data: { ...dossierData, slug },
            });
            dossierId = created.id;
            stats.dossiersCreated++;
          }

          // Resolve initiateur → DossierAuthor links
          await resolveAuthors(dossierId, dp.initiateur);
        } else {
          // Dry run: just count
          stats.dossiersCreated++;
        }

        stats.dossiersProcessed++;
      } catch (err) {
        stats.errors.push(`${file}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    timings.process = Date.now() - processStart;
  } catch (err) {
    stats.errors.push(`Fatal error: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    // Always clean the temp dir, even on a fatal error mid-run.
    const cleanupStart = Date.now();
    try {
      if (fs.existsSync(TEMP_DIR)) rmSync(TEMP_DIR, { recursive: true });
    } catch {
      // best-effort cleanup
    }
    timings.cleanup = Date.now() - cleanupStart;
  }

  // Observability summary — two structured lines for log scraping.
  console.log(
    `\n[legislation] phases(ms): download=${timings.download ?? 0} unzip=${timings.unzip ?? 0} ` +
      `listing=${timings.listing ?? 0} process=${timings.process ?? 0} cleanup=${timings.cleanup ?? 0}`
  );
  console.log(
    `[legislation] counts: totalJson=${totalJsonFiles} legFiltered=${legFilteredFiles} ` +
      `active=${stats.dossiersActive} processed=${stats.dossiersProcessed} ` +
      `created=${stats.dossiersCreated} updated=${stats.dossiersUpdated} ` +
      `wouldUpdate=${stats.dossiersWouldUpdate} ` +
      `skipped=${stats.dossiersSkipped} errors=${stats.errors.length}`
  );

  return stats;
}

const handler: SyncHandler = {
  name: "Politic Tracker - Legislative Dossiers Sync",
  description: "Import dossiers législatifs from Assemblée nationale",

  options: [
    {
      name: "--leg",
      type: "string",
      description: `Legislature number (default: ${DEFAULT_LEGISLATURE})`,
    },
    {
      name: "--active",
      type: "boolean",
      description: "Only sync active dossiers (excludes ADOPTE/REJETE/RETIRE/CADUQUE)",
    },
    {
      name: "--origin-only",
      type: "boolean",
      description:
        "Backfill origin fields on existing dossiers only, including historical dossiers in the archive",
    },
    {
      name: "--today",
      type: "boolean",
      description: "Only process dossiers modified today",
    },
    {
      name: "--since-days",
      type: "number",
      description: "Only process dossiers whose most recent act date is within N days",
    },
  ],

  showHelp() {
    console.log(`
Politic Tracker - Dossiers Législatifs Sync

Data source: data.assemblee-nationale.fr (official Open Data)

Features:
  - Downloads official ZIP file with all legislative dossiers
  - Parses dossier status from parliamentary acts (PROM = adopted)
  - Categorizes dossiers by procedure type
  - Creates/updates LegislativeDossier records
    `);
  },

  async showStats() {
    const dossiersCount = await db.legislativeDossier.count();

    const byStatus = await db.legislativeDossier.groupBy({
      by: ["status"],
      _count: true,
      orderBy: { _count: { status: "desc" } },
    });

    const byCategory = await db.legislativeDossier.groupBy({
      by: ["category"],
      _count: true,
      orderBy: { _count: { category: "desc" } },
    });

    const recentDossiers = await db.legislativeDossier.findMany({
      where: { status: "EN_COURS" },
      orderBy: { filingDate: "desc" },
      take: 5,
      select: { title: true, number: true, category: true, filingDate: true },
    });

    console.log("\n" + "=".repeat(50));
    console.log("Legislative Dossiers Stats");
    console.log("=".repeat(50));
    console.log(`Total dossiers: ${dossiersCount}`);

    if (byStatus.length > 0) {
      console.log("\nBy status:");
      for (const s of byStatus) {
        console.log(`  ${s.status}: ${s._count}`);
      }
    }

    if (byCategory.length > 0) {
      console.log("\nBy category:");
      for (const c of byCategory) {
        console.log(`  ${c.category || "(none)"}: ${c._count}`);
      }
    }

    if (recentDossiers.length > 0) {
      console.log("\nRecent active dossiers:");
      for (const d of recentDossiers) {
        const date = d.filingDate ? d.filingDate.toISOString().split("T")[0] : "N/A";
        console.log(`  - ${d.number || "?"}: ${d.title.substring(0, 50)}... (${date})`);
      }
    }
  },

  async sync(options): Promise<SyncResult> {
    const {
      dryRun = false,
      originOnly = false,
      limit,
      leg,
      active = false,
      today = false,
      sinceDays,
    } = options as {
      dryRun?: boolean;
      originOnly?: boolean;
      limit?: number;
      leg?: string;
      active?: boolean;
      today?: boolean;
      sinceDays?: number;
    };

    const legislature = leg ? parseInt(leg, 10) : DEFAULT_LEGISLATURE;
    if (isNaN(legislature) || legislature < 1) {
      return {
        success: false,
        duration: 0,
        stats: {},
        errors: ["Invalid legislature number"],
      };
    }

    console.log(`Legislature: ${legislature}e`);
    if (active) console.log("Filter: Active dossiers only");
    if (today) console.log("Filter: Dossiers modified today only");
    if (sinceDays !== undefined) console.log(`Filter: Dossiers modified within ${sinceDays} days`);
    if (originOnly) console.log("Mode: Origin fields only, existing dossiers only");
    if (dryRun) console.log("Mode: Dry run, no database writes");

    const result = await syncLegislation(legislature, {
      dryRun,
      originOnly,
      limit,
      activeOnly: active,
      todayOnly: today,
      sinceDays,
    });

    return {
      success: result.errors.length === 0,
      duration: 0,
      stats: {
        processed: result.dossiersProcessed,
        created: result.dossiersCreated,
        updated: result.dossiersUpdated,
        skipped: result.dossiersSkipped,
      },
      errors: result.errors,
    };
  },
};

createCLI(handler);
