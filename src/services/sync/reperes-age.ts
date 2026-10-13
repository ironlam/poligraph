/**
 * Import of the age structure of the communes into `TerritoireRepere` ("Le territoire en
 * chiffres", lot R2, #1052). Rules: ./reperes-age-plan.ts.
 *
 * Writes a DRAFT batch, never anything else: a person reads a sample and the counts, then
 * publishes the whole batch. The licence comes from the registry; a source whose licence is not
 * established there blocks the import.
 */
import AdmZip from "adm-zip";
import { db } from "@/lib/db";
import { USER_AGENT } from "@/config/site";
import { TERRITOIRES_SOURCES } from "@/config/territoires-sources";
import { AGE_FILE, parseAgeStructure, type AgeParseReport } from "./reperes-age-plan";

const SOURCE_ID = "insee-structure-age";
const CHUNK = 5000;

export interface AgeImportResult {
  dryRun: boolean;
  report: AgeParseReport;
  /** Id of the DRAFT batch, null in dry run. */
  importId: string | null;
  rowsWritten: number;
}

/** The licence of the source as the registry states it. Unknown means no import. */
export function licenceOfSource(sourceId = SOURCE_ID) {
  const s = TERRITOIRES_SOURCES.find((x) => x.id === sourceId);
  if (!s) throw new Error(`Source absente du registre : ${sourceId}`);
  if (!s.licence.name || !s.licence.url) {
    throw new Error(
      `Licence non établie pour ${sourceId} : import bloqué (${s.licence.note ?? ""})`
    );
  }
  return { source: s, licenceName: s.licence.name, licenceUrl: s.licence.url };
}

async function downloadCsv(): Promise<string> {
  const res = await fetch(AGE_FILE.zipUrl, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`Téléchargement INSEE : HTTP ${res.status}`);
  const zip = new AdmZip(Buffer.from(await res.arrayBuffer()));
  const entry = zip.getEntry(AGE_FILE.zipEntry);
  if (!entry) throw new Error(`Fichier absent de l'archive : ${AGE_FILE.zipEntry}`);
  return entry.getData().toString("utf8");
}

export async function syncReperesAge(opts: {
  dryRun: boolean;
  /** Already-read file content, for tests and local runs: skips the download. */
  csv?: string;
}): Promise<AgeImportResult> {
  const licence = licenceOfSource();
  const communes = await db.commune.findMany({ select: { id: true } });
  const report = parseAgeStructure(
    opts.csv ?? (await downloadCsv()),
    new Set(communes.map((c) => c.id))
  );
  if (opts.dryRun) return { dryRun: true, report, importId: null, rowsWritten: 0 };

  // A published batch already holds this period: re-importing would collide, and a published
  // figure is never replaced by a script.
  const settled = await db.territoireRepere.count({
    where: {
      indicatorKey: { startsWith: "age_tranche_" },
      periodEnd: new Date(AGE_FILE.periodEnd),
      // A rejected batch settles nothing: a corrected file for the same period may replace it.
      import: { status: { in: ["IN_REVIEW", "PUBLISHED"] } },
    },
  });
  if (settled > 0) throw new Error("Un lot relu ou publié couvre déjà cette période : arrêt.");

  const source =
    (await db.repereSource.findFirst({
      where: { resourceUrl: AGE_FILE.pageUrl, methodSlug: "structure-par-age" },
    })) ??
    (await db.repereSource.create({
      data: {
        producer: licence.source.producer,
        resourceUrl: AGE_FILE.pageUrl,
        licenceName: licence.licenceName,
        licenceUrl: licence.licenceUrl,
        attribution: licence.source.attribution ?? "Source : Insee",
        methodSlug: "structure-par-age",
      },
    }));

  // Earlier drafts of this source are replaced: they were never read as final.
  await db.repereImport.deleteMany({ where: { sourceId: source.id, status: "DRAFT" } });
  const batch = await db.repereImport.create({
    data: { sourceId: source.id, status: "DRAFT", rowCount: report.rows.length },
  });

  let written = 0;
  for (let i = 0; i < report.rows.length; i += CHUNK) {
    const res = await db.territoireRepere.createMany({
      data: report.rows.slice(i, i + CHUNK).map((r) => ({
        territoryType: "COM" as const,
        territoryCode: r.territoryCode,
        cogEdition: AGE_FILE.cogEdition,
        indicatorKey: r.indicatorKey,
        periodStart: new Date(AGE_FILE.periodStart),
        periodEnd: new Date(AGE_FILE.periodEnd),
        scopeKind: "COMMUNE" as const,
        value: r.value,
        unit: "%",
        state: r.state,
        reason: r.reason,
        importId: batch.id,
      })),
    });
    written += res.count;
  }
  return { dryRun: false, report, importId: batch.id, rowsWritten: written };
}
