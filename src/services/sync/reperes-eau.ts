/**
 * Import of the nitrates of the tap water into `TerritoireRepere` ("Le territoire en chiffres",
 * lot R4, #1052). Rules: src/lib/territoires/eau-nitrates.ts.
 *
 * The ministry files weigh about 1.3 GB per year once unzipped: everything is read as a stream,
 * nothing is loaded whole. Writes a DRAFT batch and nothing else; a person reads it and
 * publishes it from the admin page. The licence comes from the registry.
 */
import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { parse } from "csv-parse";
import yauzl from "yauzl";
import { db } from "@/lib/db";
import { USER_AGENT } from "@/config/site";
import { EAU_NITRATES_LIMIT_MG_L } from "@/config/territoire-reperes";
import {
  addAnalysis,
  buildEauRows,
  classifyAnalysis,
  DEFAULT_SAMPLE_POLICY,
  eauWindow,
  inWindow,
  parseLimit,
  sampleCounts,
  type CommuneUdiLink,
  type SamplePolicy,
  type EauRow,
  type EauWindow,
  type UdiCount,
} from "@/lib/territoires/eau-nitrates";
import { licenceOfSource } from "./reperes-age";

const SOURCE_ID = "sante-eau-distribuee";
const DATASET_API = "https://www.data.gouv.fr/api/1/datasets/5cf8d9ed8b4c4110294c841d/";
const NITRATES = "NO3";
const CHUNK = 5000;

export interface EauImportReport {
  window: EauWindow;
  years: number[];
  /** Units that have at least one counted analysis. */
  unitsWithAnalyses: number;
  rows: EauRow[];
  established: number;
  belowThreshold: number;
  communes: number;
  /** Results that could not be placed against the limit: reported, not counted. */
  indeterminate: number;
  /** Results stated against another limit or unit than 50 mg/L: left out. */
  otherLimit: number;
  policy: SamplePolicy;
  /** Sampling lines left out by the policy (all years, window not applied to the current year). */
  droppedLines: number;
}

export interface EauImportResult {
  dryRun: boolean;
  report: EauImportReport;
  importId: string | null;
  rowsWritten: number;
}

async function resourceUrls(): Promise<Map<number, string>> {
  const res = await fetch(DATASET_API, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`data.gouv.fr : HTTP ${res.status}`);
  const json = (await res.json()) as { resources: { title: string; url: string }[] };
  const out = new Map<number, string>();
  for (const r of json.resources) {
    const m = /^dis-(\d{4})\.zip$/.exec(r.title);
    if (m) out.set(Number(m[1]), r.url);
  }
  return out;
}

async function ensureZip(year: number, urls: Map<number, string>, dir: string): Promise<string> {
  mkdirSync(dir, { recursive: true });
  const dest = join(dir, `dis-${year}.zip`);
  if (existsSync(dest)) return dest;
  const url = urls.get(year);
  if (!url) throw new Error(`Fichier ${year} absent du jeu de données`);
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok || !res.body) throw new Error(`Téléchargement ${year} : HTTP ${res.status}`);
  await pipeline(Readable.fromWeb(res.body as never), createWriteStream(dest));
  return dest;
}

/** Streams the rows of one file of a zip, parsed as CSV with a header. Never loaded whole. */
async function* rowsOf(zipPath: string, name: string): AsyncGenerator<Record<string, string>> {
  const zip = await new Promise<yauzl.ZipFile>((resolve, reject) =>
    yauzl.open(zipPath, { lazyEntries: true }, (e, z) => (e || !z ? reject(e) : resolve(z)))
  );
  try {
    const stream = await new Promise<Readable>((resolve, reject) => {
      zip.on("entry", (entry: yauzl.Entry) => {
        if (entry.fileName !== name) return zip.readEntry();
        zip.openReadStream(entry, (e, s) => (e || !s ? reject(e) : resolve(s)));
      });
      zip.on("end", () => reject(new Error(`Fichier absent de l'archive : ${name}`)));
      zip.readEntry();
    });
    const parser = stream.pipe(
      parse({ columns: true, relax_quotes: true, skip_empty_lines: true })
    );
    for await (const row of parser) yield row as Record<string, string>;
  } finally {
    zip.close();
  }
}

/**
 * One sampling reference can concern several distribution units: every unit it lists is kept.
 * Keeping only the last line of a reference attributes its results to a single unit.
 */
interface SampleEntry {
  udis: string[];
  date: string;
}

async function samplesOf(zipPath: string, year: number, policy: SamplePolicy, w?: EauWindow) {
  const map = new Map<string, SampleEntry>();
  let latest = "";
  let dropped = 0;
  for await (const r of rowsOf(zipPath, `DIS_PLV_${year}.txt`)) {
    const date = r.dateprel ?? "";
    if (date > latest) latest = date;
    if (w && !inWindow(date, w)) continue;
    if (
      !sampleCounts(policy, {
        cdreseauamont: r.cdreseauamont ?? "",
        pourcentdebit: r.pourcentdebit ?? "",
      })
    ) {
      dropped++;
      continue;
    }
    const ref = r.referenceprel as string;
    const entry = map.get(ref);
    const udi = r.cdreseau as string;
    if (!entry) map.set(ref, { udis: [udi], date });
    else if (!entry.udis.includes(udi)) entry.udis.push(udi);
  }
  return { map, latest, dropped };
}

export async function syncReperesEau(opts: {
  dryRun: boolean;
  cacheDir: string;
  policy?: SamplePolicy;
  onProgress?: (msg: string) => void;
}): Promise<EauImportResult> {
  const log = opts.onProgress ?? (() => {});
  const policy = opts.policy ?? DEFAULT_SAMPLE_POLICY;
  const licence = licenceOfSource(SOURCE_ID);
  const urls = await resourceUrls();
  const currentYear = Math.max(...urls.keys());

  log(`Téléchargement ${currentYear}`);
  const currentZip = await ensureZip(currentYear, urls, opts.cacheDir);
  const current = await samplesOf(currentZip, currentYear, policy);
  const window = eauWindow(current.latest);
  const firstYear = Number(window.start.slice(0, 4));
  const years: number[] = [];
  for (let y = firstYear; y <= currentYear; y++) years.push(y);
  log(`Fenêtre ${window.start} au ${window.end}, années ${years.join(", ")}`);

  const counts = new Map<string, UdiCount>();
  let otherLimit = 0;
  let droppedLines = current.dropped;
  for (const year of years) {
    const zip = year === currentYear ? currentZip : await ensureZip(year, urls, opts.cacheDir);
    let samples = current.map;
    if (year !== currentYear) {
      const other = await samplesOf(zip, year, policy, window);
      samples = other.map;
      droppedLines += other.dropped;
    }
    log(`Résultats ${year} (${samples.size} prélèvements dans la fenêtre)`);
    for await (const r of rowsOf(zip, `DIS_RESULT_${year}.txt`)) {
      if (r.cdparametresiseeaux !== NITRATES) continue;
      const s = samples.get(r.referenceprel as string);
      if (!s || !inWindow(s.date, window)) continue;
      const limit = parseLimit(r.limitequal ?? "");
      if (limit !== EAU_NITRATES_LIMIT_MG_L) {
        otherLimit++;
        continue;
      }
      const verdict = classifyAnalysis(r.rqana ?? "", limit);
      for (const udi of s.udis) addAnalysis(counts, udi, verdict);
    }
  }

  log("Liens commune et unité");
  const links: CommuneUdiLink[] = [];
  for await (const r of rowsOf(currentZip, `DIS_COM_UDI_${currentYear}.txt`)) {
    links.push({
      commune: r.inseecommune as string,
      udi: r.cdreseau as string,
      udiLabel: (r.nomreseau as string) ?? "",
    });
  }

  const known = new Set((await db.commune.findMany({ select: { id: true } })).map((c) => c.id));
  const rows = buildEauRows(links, counts, known);
  const report: EauImportReport = {
    window,
    years,
    unitsWithAnalyses: [...counts.values()].filter((c) => c.analyses > 0).length,
    rows,
    established: rows.filter((r) => r.state === "ETABLI").length,
    belowThreshold: rows.filter((r) => r.state === "NON_ETABLI").length,
    communes: new Set(rows.map((r) => r.territoryCode)).size,
    indeterminate: [...counts.values()].reduce((a, c) => a + c.indeterminate, 0),
    otherLimit,
    policy,
    droppedLines,
  };
  if (opts.dryRun) return { dryRun: true, report, importId: null, rowsWritten: 0 };

  const settled = await db.territoireRepere.count({
    where: {
      indicatorKey: "eau_nitrates",
      periodEnd: new Date(window.end),
      import: { status: { in: ["IN_REVIEW", "PUBLISHED"] } },
    },
  });
  if (settled > 0) throw new Error("Un lot relu ou publié couvre déjà cette période : arrêt.");

  const source =
    (await db.repereSource.findFirst({
      where: { resourceUrl: licence.source.url, methodSlug: "eau-du-robinet" },
    })) ??
    (await db.repereSource.create({
      data: {
        producer: licence.source.producer,
        resourceUrl: licence.source.url,
        licenceName: licence.licenceName,
        licenceUrl: licence.licenceUrl,
        attribution: licence.source.attribution ?? "Source : ministère chargé de la santé",
        methodSlug: "eau-du-robinet",
      },
    }));

  await db.repereImport.deleteMany({ where: { sourceId: source.id, status: "DRAFT" } });
  const batch = await db.repereImport.create({
    data: { sourceId: source.id, status: "DRAFT", rowCount: rows.length },
  });
  let written = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const res = await db.territoireRepere.createMany({
      data: rows.slice(i, i + CHUNK).map((r) => ({
        territoryType: "COM" as const,
        territoryCode: r.territoryCode,
        indicatorKey: r.indicatorKey,
        periodStart: new Date(window.start),
        periodEnd: new Date(window.end),
        scopeKind: "UDI" as const,
        scopeId: r.scopeId,
        scopeLabel: r.scopeLabel,
        value: r.value,
        unit: "analyses",
        sampleSize: r.sampleSize,
        state: r.state,
        reason: r.reason,
        importId: batch.id,
      })),
    });
    written += res.count;
  }
  return { dryRun: false, report, importId: batch.id, rowsWritten: written };
}
