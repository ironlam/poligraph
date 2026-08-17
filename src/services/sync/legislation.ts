/**
 * Service to sync legislative dossiers from data.assemblee-nationale.fr.
 * Extracted from scripts/sync-legislation.ts for Inngest compatibility.
 */

import { db } from "@/lib/db";
import { generateDateSlug, generateUniqueSlug } from "@/lib/utils";
import { DataSource, DossierStatus, Prisma } from "@/generated/prisma";
import type { DossierTimelineEntry } from "@/types/legislation";
import * as fs from "fs";
import * as path from "path";
import { mkdirSync, rmSync, readdirSync, readFileSync } from "fs";
import { extractZip } from "@/lib/parsing/unzip";
import { downloadFileWithRetry } from "@/lib/download-file";
import { safeJsonParseOrThrow } from "@/lib/api/safe-json";

const DEFAULT_LEGISLATURE = 17;
const TEMP_DIR = "/tmp/dossiers-legislatifs-an";
const ZIP_URL_TEMPLATE =
  "https://data.assemblee-nationale.fr/static/openData/repository/{leg}/loi/dossiers_legislatifs/Dossiers_Legislatifs.json.zip";

const CATEGORY_MAPPING: Record<string, string> = {
  "Projet de loi de finances": "Budget",
  "Projet de loi de financement de la s\u00e9curit\u00e9 sociale": "Sant\u00e9",
  "Proposition de loi ordinaire": "L\u00e9gislation",
  "Projet de loi ordinaire": "L\u00e9gislation",
  "Projet ou proposition de loi organique": "Institutionnel",
  "Projet ou proposition de loi constitutionnelle": "Constitution",
  "Projet de ratification des trait\u00e9s et conventions": "International",
  "Commission d'enqu\u00eate": "Contr\u00f4le",
  "Mission d'information": "Information",
  "Rapport d'information": "Information",
  "Rapport d'information sans mission": "Information",
};

export interface LegislationSyncResult {
  dossiersProcessed: number;
  dossiersCreated: number;
  dossiersUpdated: number;
  dossiersSkipped: number;
  errors: string[];
}

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

function findFirstDocumentRef(actes: ANActe | ANActe[] | undefined | null): string | null {
  if (!actes) return null;
  const acteArray = Array.isArray(actes) ? actes : [actes];
  for (const acte of acteArray) {
    if (acte.texteAssocie) return acte.texteAssocie;
    if (acte.actesLegislatifs?.acteLegislatif) {
      const found = findFirstDocumentRef(acte.actesLegislatifs.acteLegislatif);
      if (found) return found;
    }
  }
  return null;
}

function findAllDates(actes: ANActe | ANActe[] | undefined | null): Date[] {
  if (!actes) return [];
  const acteArray = Array.isArray(actes) ? actes : [actes];
  const dates: Date[] = [];
  for (const acte of acteArray) {
    if (acte.dateActe) {
      try {
        const d = new Date(acte.dateActe);
        if (!isNaN(d.getTime())) dates.push(d);
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

function inferChamber(code: string): string {
  if (code.startsWith("ANL") || code.startsWith("AN1") || code.startsWith("AN2")) return "AN";
  if (code.startsWith("SNL") || code.startsWith("SN1") || code.startsWith("SN2")) return "SENAT";
  if (code.startsWith("CMP")) return "CMP";
  if (code.startsWith("CC")) return "CC";
  if (code.startsWith("PROM")) return "GOV";
  // Fallback heuristics based on known AN-specific codes
  if (code.includes("DEPOT") || code.includes("COM-FOND") || code.includes("COM-AVIS")) return "AN";
  if (code.includes("DEBATS")) return "AN";
  return "UNKNOWN";
}

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

function determineStatus(codes: string[], legislature?: number): DossierStatus {
  if (codes.some((c) => c === "PROM" || c === "PROM-PUB")) return "ADOPTE";
  if (codes.some((c) => c.includes("REJET"))) return "REJETE";
  if (codes.some((c) => c.includes("RETRAIT") || c.includes("RETIRE"))) return "RETIRE";
  if (codes.some((c) => c.startsWith("CC-SAISIE"))) return "CONSEIL_CONSTITUTIONNEL";
  if (legislature && legislature < DEFAULT_LEGISLATURE) return "CADUQUE";

  const hasDebates = codes.some(
    (c) =>
      c.includes("DEBATS-SEANCE") ||
      c.includes("DEBATS-DEC") ||
      c.startsWith("CMP") ||
      c.startsWith("ANLUNI") ||
      c.startsWith("ANLDEF") ||
      c.startsWith("SNLDEF")
  );
  if (hasDebates) return "EN_COURS";

  const hasCommitteeReport = codes.some(
    (c) => c.includes("COM-FOND-RAPPORT") || c.includes("COM-AVIS-RAPPORT")
  );
  if (hasCommitteeReport) return "EN_COMMISSION";

  // RTRINI = "Retrait d'une initiative" — only mark RETIRE if no debates followed
  // (during active discussion, RTRINI indicates a partial retrait, not full withdrawal)
  if (codes.some((c) => c.includes("RTRINI"))) return "RETIRE";

  return "DEPOSE";
}

function generateShortTitle(title: string): string {
  let short = title
    .replace(/^Projet de loi /i, "")
    .replace(/^Proposition de loi /i, "")
    .replace(/^(relatif|relative) (\u00e0|au|aux|\u00e0 la|\u00e0 l') /i, "")
    .replace(/^(portant|visant \u00e0) /i, "")
    .replace(/^(pour|sur) (le|la|les|l') /i, "");
  short = short.charAt(0).toUpperCase() + short.slice(1);
  return short;
}

function extractNumber(dossier: ANDossier): string | null {
  const uid = dossier.dossierParlementaire.uid;
  const procedure = dossier.dossierParlementaire.procedureParlementaire?.libelle || "";
  const match = uid.match(/N(\d+)$/);
  if (!match) return null;
  const num = match[1]!;
  if (procedure.toLowerCase().includes("projet")) return `PJL ${num}`;
  if (procedure.toLowerCase().includes("proposition")) return `PPL ${num}`;
  return num;
}

function getCategory(procedure: string): string | null {
  return CATEGORY_MAPPING[procedure] || null;
}

async function generateUniqueDossierSlug(date: Date | null, title: string): Promise<string> {
  const baseSlug = generateDateSlug(date, title);
  return generateUniqueSlug(baseSlug, (s) =>
    db.legislativeDossier.findUnique({ where: { slug: s } }).then(Boolean)
  );
}

export async function syncLegislation(options?: {
  legislature?: number;
  activeOnly?: boolean;
  todayOnly?: boolean;
  sinceDays?: number;
  limit?: number;
}): Promise<LegislationSyncResult> {
  const {
    legislature = DEFAULT_LEGISLATURE,
    activeOnly = false,
    todayOnly = false,
    sinceDays,
    limit,
  } = options ?? {};

  const stats: LegislationSyncResult = {
    dossiersProcessed: 0,
    dossiersCreated: 0,
    dossiersUpdated: 0,
    dossiersSkipped: 0,
    errors: [],
  };

  try {
    // Download ZIP
    console.log("Downloading dossiers ZIP...");
    const zipUrl = ZIP_URL_TEMPLATE.replace("{leg}", String(legislature));
    const zipPath = path.join(TEMP_DIR, "dossiers.zip");

    if (fs.existsSync(TEMP_DIR)) {
      rmSync(TEMP_DIR, { recursive: true });
    }
    mkdirSync(TEMP_DIR, { recursive: true });

    await downloadFileWithRetry(zipUrl, zipPath);
    console.log("Downloaded ZIP file");

    // Extract ZIP (system tool, not Node.js script spawn)
    extractZip(zipPath, TEMP_DIR);
    console.log("Extracted ZIP file");

    // List JSON files
    const jsonDir = path.join(TEMP_DIR, "json", "dossierParlementaire");
    if (!fs.existsSync(jsonDir)) {
      throw new Error(`Directory not found: ${jsonDir}`);
    }

    let jsonFiles = readdirSync(jsonDir).filter((f) => f.endsWith(".json"));
    jsonFiles = jsonFiles.filter((f) => f.includes(`L${legislature}`));

    if (limit) {
      jsonFiles = jsonFiles.slice(0, limit);
    }

    console.log(`Found ${jsonFiles.length} dossiers to process`);

    for (const file of jsonFiles) {
      try {
        const filePath = path.join(jsonDir, file);
        const content = readFileSync(filePath, "utf-8");
        if (!content.trim()) {
          stats.dossiersSkipped++;
          continue;
        }

        const data = safeJsonParseOrThrow<ANDossier>(content);
        const dp = data.dossierParlementaire;

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
        const shortTitle = generateShortTitle(title);
        const number = extractNumber(data);
        const procedure = dp.procedureParlementaire?.libelle || "";
        const category = getCategory(procedure);
        const documentExternalId = findFirstDocumentRef(dp.actesLegislatifs?.acteLegislatif);

        const allCodes = findAllCodes(dp.actesLegislatifs?.acteLegislatif);
        const dossierLeg = parseInt(dp.legislature, 10) || legislature;
        const status = determineStatus(allCodes, dossierLeg);

        const activeStatuses: DossierStatus[] = [
          "DEPOSE",
          "EN_COMMISSION",
          "EN_COURS",
          "CONSEIL_CONSTITUTIONNEL",
        ];
        if (activeOnly && !activeStatuses.includes(status)) {
          stats.dossiersSkipped++;
          continue;
        }

        const allDates = findAllDates(dp.actesLegislatifs?.acteLegislatif).sort(
          (a, b) => a.getTime() - b.getTime()
        );

        if (sinceDays !== undefined && allDates.length > 0) {
          const cutoff = Date.now() - sinceDays * 24 * 60 * 60 * 1000;
          if (allDates[allDates.length - 1]!.getTime() < cutoff) {
            stats.dossiersSkipped++;
            continue;
          }
        }

        if (todayOnly && allDates.length > 0) {
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

        const sourceUrl = `https://www.assemblee-nationale.fr/dyn/${legislature}/dossiers/${dp.titreDossier?.titreChemin || externalId}`;

        const senatChemin = dp.titreDossier?.senatChemin;
        const senatUrl = senatChemin
          ? senatChemin.startsWith("http")
            ? senatChemin
            : `https://www.senat.fr/dossier-legislatif/${senatChemin}.html`
          : null;

        const timeline = buildTimeline(dp.actesLegislatifs?.acteLegislatif);

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
        };

        let dossierId: string;
        if (existing) {
          const updateData: typeof dossierData & { slug?: string } = {
            ...dossierData,
          };
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
          const slug = await generateUniqueDossierSlug(filingDate!, shortTitle || title);
          const created = await db.legislativeDossier.create({
            data: { ...dossierData, slug },
          });
          dossierId = created.id;
          stats.dossiersCreated++;
        }

        // Resolve initiateur → DossierAuthor links
        await resolveAuthors(dossierId, dp.initiateur);

        stats.dossiersProcessed++;
      } catch (err) {
        stats.errors.push(`${file}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } catch (err) {
    stats.errors.push(`Fatal: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    // Always clean the temp dir, even on a fatal error mid-run.
    try {
      if (fs.existsSync(TEMP_DIR)) rmSync(TEMP_DIR, { recursive: true });
    } catch {
      // best-effort cleanup
    }
  }

  return stats;
}
