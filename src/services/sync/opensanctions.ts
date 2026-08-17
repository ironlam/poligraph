import { createReadStream, createWriteStream } from "fs";
import { unlink } from "fs/promises";
import { get } from "https";
import { tmpdir } from "os";
import { join } from "path";
import { createInterface } from "readline";
import { pipeline } from "stream/promises";

import { DataSource, Judgement, MatchMethod } from "@/generated/prisma";
import { db } from "@/lib/db";
import { resolveBatch } from "@/lib/identity";
import type { ResolveInput } from "@/lib/identity";
import { createOpenSanctionsClient } from "@/lib/api/opensanctions";
import { safeJsonParseOrThrow } from "@/lib/api/safe-json";

// --- FtM types ---

interface FtmEntity {
  id: string;
  caption: string;
  schema: string;
  properties: Record<string, string[]>;
  datasets: string[];
  referents: string[];
  target: boolean;
  first_seen: string;
  last_seen: string;
  last_change: string;
}

export interface ParsedPerson {
  entityId: string;
  firstName: string;
  lastName: string;
  birthDate: Date | null;
  gender: string | null;
  datasets: string[];
  url: string;
}

// --- Pure parsing functions ---

function parseBirthDate(raw: string | undefined): Date | null {
  if (!raw) return null;
  // Partial dates: "1965" -> 1965-01-01, "1965-03" -> 1965-03-01
  if (/^\d{4}$/.test(raw)) return new Date(`${raw}-01-01`);
  if (/^\d{4}-\d{2}$/.test(raw)) return new Date(`${raw}-01`);
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

export function parseFtmPerson(entity: FtmEntity): ParsedPerson | null {
  if (entity.schema !== "Person") return null;

  const firstName = entity.properties.firstName?.[0];
  const lastName = entity.properties.lastName?.[0];
  if (!firstName || !lastName) return null;

  return {
    entityId: entity.id,
    firstName,
    lastName,
    birthDate: parseBirthDate(entity.properties.birthDate?.[0]),
    gender: entity.properties.gender?.[0] ?? null,
    datasets: entity.datasets,
    url: `https://www.opensanctions.org/entities/${entity.id}/`,
  };
}

export function toResolveInput(person: ParsedPerson): ResolveInput {
  return {
    firstName: person.firstName,
    lastName: person.lastName,
    birthDate: person.birthDate,
    source: DataSource.OPENSANCTIONS,
    sourceId: person.entityId,
    gender: person.gender,
    context: { datasets: person.datasets },
  };
}

// --- Sync orchestrator ---

const PEPS_NDJSON_URL = "https://data.opensanctions.org/datasets/latest/peps/entities.ftm.json";

export interface OpenSanctionsSyncStats {
  downloaded: number;
  frenchFiltered: number;
  matched: number;
  review: number;
  notFound: number;
  errors: string[];
}

async function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest);
    get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        if (!redirectUrl) return reject(new Error("Redirect without location"));
        file.close();
        return downloadFile(redirectUrl, dest).then(resolve).catch(reject);
      }
      if (response.statusCode !== 200) {
        file.close();
        return reject(new Error(`HTTP ${response.statusCode}`));
      }
      pipeline(response, file).then(resolve).catch(reject);
    }).on("error", reject);
  });
}

async function parseNdjsonFile(
  filePath: string
): Promise<{ persons: ParsedPerson[]; totalLines: number }> {
  const persons: ParsedPerson[] = [];
  let totalLines = 0;

  const rl = createInterface({
    input: createReadStream(filePath, { encoding: "utf-8" }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;
    totalLines++;

    try {
      const entity = safeJsonParseOrThrow<FtmEntity>(line);
      if (entity.schema !== "Person" || !entity.properties.country?.includes("fr")) {
        continue;
      }

      const parsed = parseFtmPerson(entity);
      if (parsed) persons.push(parsed);
    } catch {
      // Skip malformed lines
    }
  }

  return { persons, totalLines };
}

export async function syncOpenSanctions(options?: {
  limit?: number;
}): Promise<OpenSanctionsSyncStats> {
  const stats: OpenSanctionsSyncStats = {
    downloaded: 0,
    frenchFiltered: 0,
    matched: 0,
    review: 0,
    notFound: 0,
    errors: [],
  };

  // 1. Download NDJSON to temp file
  const tmpPath = join(tmpdir(), `opensanctions-peps-${Date.now()}.ndjson`);
  console.log(`Downloading PEPs dataset to ${tmpPath}...`);

  try {
    await downloadFile(PEPS_NDJSON_URL, tmpPath);
  } catch (err) {
    stats.errors.push(`Download failed: ${err}`);
    return stats;
  }

  // 2. Stream-parse and filter French persons
  console.log("Parsing NDJSON and filtering French persons...");
  const { persons, totalLines } = await parseNdjsonFile(tmpPath);
  stats.downloaded = totalLines;
  stats.frenchFiltered = persons.length;

  console.log(`Parsed ${totalLines} entities, ${persons.length} French persons`);

  // 3. Apply limit if specified
  const toResolve = options?.limit ? persons.slice(0, options.limit) : persons;

  // 4. Resolve against Poligraph politicians
  console.log(`Resolving ${toResolve.length} persons...`);
  const inputs = toResolve.map(toResolveInput);

  const batchResult = await resolveBatch({
    inputs,
    sourceType: DataSource.OPENSANCTIONS,
    onProgress: (processed, total) => {
      if (processed % 5000 === 0) {
        console.log(`  Progress: ${processed}/${total}`);
      }
    },
  });

  // 5. Upsert ExternalIds for auto-matches
  for (const result of batchResult.results) {
    if (result.decision === Judgement.SAME && result.politicianId) {
      const person = toResolve.find((p) => p.entityId === result.sourceId);
      if (!person) continue;

      try {
        await db.externalId.upsert({
          where: {
            source_externalId: {
              source: DataSource.OPENSANCTIONS,
              externalId: person.entityId,
            },
          },
          create: {
            politicianId: result.politicianId,
            source: DataSource.OPENSANCTIONS,
            externalId: person.entityId,
            url: person.url,
            confidence: result.confidence,
            matchedBy: result.method,
            metadata: { datasets: person.datasets },
          },
          update: {
            politicianId: result.politicianId,
            url: person.url,
            confidence: result.confidence,
            metadata: { datasets: person.datasets },
          },
        });
        stats.matched++;
      } catch (err) {
        stats.errors.push(`ExternalId upsert failed for ${person.entityId}: ${err}`);
      }
    } else if (result.decision === Judgement.UNDECIDED) {
      stats.review++;
    } else {
      stats.notFound++;
    }
  }

  // 6. Cleanup temp file
  try {
    await unlink(tmpPath);
  } catch {
    // Non-critical
  }

  console.log(
    `Done: ${stats.matched} matched, ${stats.review} for review, ${stats.notFound} not found`
  );
  return stats;
}

// --- Phase 2: Incremental API sync ---

export interface IncrementalSyncStats {
  total: number;
  matched: number;
  review: number;
  notFound: number;
  errors: string[];
}

export async function syncOpenSanctionsIncremental(options?: {
  limit?: number;
  concurrency?: number;
}): Promise<IncrementalSyncStats> {
  const client = createOpenSanctionsClient();
  if (!client) {
    throw new Error(
      "OPENSANCTIONS_API_KEY is required for incremental sync. " +
        "Set it in .env or use bulk sync instead."
    );
  }

  const stats: IncrementalSyncStats = {
    total: 0,
    matched: 0,
    review: 0,
    notFound: 0,
    errors: [],
  };

  // 1. Find published politicians without OpenSanctions ExternalId
  const unlinked = await db.politician.findMany({
    where: {
      publicationStatus: "PUBLISHED",
      externalIds: {
        none: { source: DataSource.OPENSANCTIONS },
      },
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      birthDate: true,
    },
    ...(options?.limit ? { take: options.limit } : {}),
  });

  stats.total = unlinked.length;
  console.log(`Found ${unlinked.length} unlinked politicians`);

  if (unlinked.length === 0) return stats;

  // 2. Match each via API with concurrency control
  const concurrency = options?.concurrency ?? 5;

  for (let i = 0; i < unlinked.length; i += concurrency) {
    const batch = unlinked.slice(i, i + concurrency);

    await Promise.allSettled(
      batch.map(async (politician) => {
        const name = `${politician.firstName} ${politician.lastName}`;
        const birthDate = politician.birthDate?.toISOString().split("T")[0];

        try {
          const results = await client.match(name, {
            birthDate,
            threshold: 0.7,
            limit: 3,
          });

          if (results.length === 0) {
            stats.notFound++;
            return;
          }

          const best = results[0]!;

          if (best.score >= 0.95) {
            await db.externalId.upsert({
              where: {
                source_externalId: {
                  source: DataSource.OPENSANCTIONS,
                  externalId: best.id,
                },
              },
              create: {
                politicianId: politician.id,
                source: DataSource.OPENSANCTIONS,
                externalId: best.id,
                url: `https://www.opensanctions.org/entities/${best.id}/`,
                confidence: best.score,
                matchedBy: MatchMethod.EXTERNAL_API,
                metadata: { datasets: best.datasets },
              },
              update: {
                politicianId: politician.id,
                url: `https://www.opensanctions.org/entities/${best.id}/`,
                confidence: best.score,
                metadata: { datasets: best.datasets },
              },
            });
            stats.matched++;
          } else {
            stats.review++;
            console.log(`  REVIEW: ${name} -> ${best.caption} (${(best.score * 100).toFixed(0)}%)`);
          }
        } catch (err) {
          stats.errors.push(
            `Match failed for ${name}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      })
    );

    if ((i + concurrency) % 50 === 0 || i + concurrency >= unlinked.length) {
      console.log(`  Progress: ${Math.min(i + concurrency, unlinked.length)}/${unlinked.length}`);
    }
  }

  console.log(
    `Done: ${stats.matched} matched, ${stats.review} for review, ${stats.notFound} not found`
  );
  return stats;
}
