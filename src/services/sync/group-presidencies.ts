/**
 * Imports who presides each parliamentary group, from the open data of its own chamber.
 *
 * Runs inside the sync of each chamber (`syncDeputes`, `syncSenateurs`), after people and groups
 * are in base: a presidency links two rows that must exist. People and groups are joined on their
 * official identifiers only. A president the base cannot identify is reported and left out, never
 * matched on a name.
 */

import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { db } from "@/lib/db";
import { Chamber, DataSource } from "@/generated/prisma";
import { HTTPClient } from "@/lib/api/http-client";
import { extractZip } from "@/lib/parsing/unzip";
import { safeJsonParseOrThrow } from "@/lib/api/safe-json";
import { ASSEMBLEE_OPENDATA_RATE_LIMIT_MS, SENAT_RATE_LIMIT_MS } from "@/config/rate-limits";
import { getAssemblyGroupOrganeRefs } from "@/config/parliamentaryGroups";
import {
  AN_GROUP_PRESIDENCIES_SOURCE_URL,
  SENATE_GROUP_PRESIDENCIES_SOURCE_URL,
  parseAnGroupPresidencies,
  parseSenateGroupPresidencies,
  type GroupPresidencyPeriod,
} from "@/lib/parlement/group-presidencies";

export interface GroupPresidenciesSyncStats {
  /** Periods read from the source, every group and person included. */
  periodsFound: number;
  written: number;
  /** Open periods of this source that the source no longer lists. */
  closed: number;
  errors: string[];
}

type PresidencySource = "ASSEMBLEE_NATIONALE" | "SENAT";

interface ResolveMaps {
  /** Official group reference (organe uid, Sénat group code) to ParliamentaryGroup id. */
  groupIds: ReadonlyMap<string, string>;
  /** Official person reference (acteur uid, matricule) to Politician id. */
  politicianIds: ReadonlyMap<string, string>;
}

function emptyStats(): GroupPresidenciesSyncStats {
  return { periodsFound: 0, written: 0, closed: 0, errors: [] };
}

async function politicianIdsByExternalId(
  source: PresidencySource,
  refs: readonly string[]
): Promise<Map<string, string>> {
  const rows = await db.externalId.findMany({
    where: { source, externalId: { in: [...new Set(refs)] }, politicianId: { not: null } },
    select: { externalId: true, politicianId: true },
  });
  return new Map(rows.map((row) => [row.externalId, row.politicianId!]));
}

/**
 * Writes the periods of one source and closes the ones it dropped.
 *
 * An open period is closed only when the source stops listing it, and the day it stopped is not
 * published then: the closing date is the day the sync saw it gone. The Sénat file keeps its
 * history, so there the end date normally arrives from the source through the upsert.
 *
 * A row the parser could not read is absent from `periods`: it may be a sitting president, so
 * nothing is closed while one exists (the valid periods are still written).
 */
async function writePresidencies(
  source: PresidencySource,
  sourceUrl: string,
  periods: readonly GroupPresidencyPeriod[],
  unreadableRows: number,
  maps: ResolveMaps,
  stats: GroupPresidenciesSyncStats
): Promise<void> {
  // A source that names no sitting president is broken or has changed shape. Writing from it
  // would close every presidency in base.
  if (!periods.some((period) => period.endDate === null)) {
    stats.errors.push(`Aucune présidence en cours dans ${sourceUrl} : rien n'est écrit`);
    return;
  }

  const now = new Date();
  for (const period of periods) {
    const parliamentaryGroupId = maps.groupIds.get(period.groupRef);
    const politicianId = maps.politicianIds.get(period.personRef);
    if (!parliamentaryGroupId || !politicianId) {
      // History the base does not hold (a former group, a senator from before our scope) is
      // expected. A sitting president we cannot attach is a gap the reader will see.
      if (period.endDate === null) {
        const missing = parliamentaryGroupId
          ? `personne ${period.personRef}`
          : `groupe ${period.groupRef}`;
        stats.errors.push(`Présidence en cours non rattachée (${missing} inconnu en base)`);
      }
      continue;
    }
    const data = {
      parliamentaryGroupId,
      politicianId,
      startDate: period.startDate,
      endDate: period.endDate,
      sourceUrl,
      lastConfirmedAt: now,
    };
    await db.parliamentaryGroupPresidency.upsert({
      where: { source_externalId: { source, externalId: period.externalId } },
      create: { ...data, source, externalId: period.externalId },
      update: data,
    });
    stats.written++;
  }

  if (unreadableRows > 0) {
    stats.errors.push(
      `${unreadableRows} ligne(s) illisible(s) dans ${sourceUrl} : fermetures ignorées`
    );
    return;
  }

  const closed = await db.parliamentaryGroupPresidency.updateMany({
    where: {
      source,
      endDate: null,
      externalId: { notIn: periods.map((period) => period.externalId) },
    },
    data: { endDate: now },
  });
  stats.closed = closed.count;
}

/**
 * Assemblée nationale: the AMO10 archive lists, for every sitting deputy, a mandate in their
 * group whose quality is "Président" for the one who presides it. Groups are joined on the organ
 * uid through the crosswalk of `ASSEMBLY_GROUP_ORGANE_REFS`.
 */
export async function syncAnGroupPresidencies(): Promise<GroupPresidenciesSyncStats> {
  const stats = emptyStats();
  const tempDir = mkdtempSync(path.join(tmpdir(), "an-presidences-"));
  try {
    const client = new HTTPClient({ rateLimitMs: ASSEMBLEE_OPENDATA_RATE_LIMIT_MS });
    const { data: zip } = await client.getBuffer(AN_GROUP_PRESIDENCIES_SOURCE_URL);
    const zipPath = path.join(tempDir, "amo10.zip");
    writeFileSync(zipPath, zip);
    extractZip(zipPath, tempDir);

    const acteurDir = path.join(tempDir, "json", "acteur");
    const periods: GroupPresidencyPeriod[] = [];
    let unreadableRows = 0;
    for (const file of readdirSync(acteurDir).filter((name) => name.endsWith(".json"))) {
      const parsed = parseAnGroupPresidencies(
        safeJsonParseOrThrow<unknown>(readFileSync(path.join(acteurDir, file), "utf8"))
      );
      periods.push(...parsed.periods);
      unreadableRows += parsed.invalid.length;
      stats.errors.push(...parsed.invalid.map((row) => `Présidence AN illisible : ${row}`));
    }
    stats.periodsFound = periods.length;

    const groups = await db.parliamentaryGroup.findMany({
      where: { chamber: Chamber.AN, legislature: { not: null } },
      select: { id: true, code: true, legislature: true },
    });
    const groupIds = new Map<string, string>();
    for (const group of groups) {
      for (const organeRef of getAssemblyGroupOrganeRefs(group.code, group.legislature!)) {
        groupIds.set(organeRef, group.id);
      }
    }
    const politicianIds = await politicianIdsByExternalId(
      DataSource.ASSEMBLEE_NATIONALE,
      periods.map((period) => period.personRef)
    );

    await writePresidencies(
      DataSource.ASSEMBLEE_NATIONALE,
      AN_GROUP_PRESIDENCIES_SOURCE_URL,
      periods,
      unreadableRows,
      { groupIds, politicianIds },
      stats
    );
  } catch (error) {
    stats.errors.push(`Présidences de groupe AN : ${String(error)}`);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
  return stats;
}

function decodeSenateCsv(buffer: Buffer): string {
  // The Sénat exports in a single-byte encoding. Try UTF-8 first so a future switch on their
  // side does not turn every accent into mojibake.
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder("windows-1252").decode(buffer);
  }
}

/**
 * Sénat: ODSEN_HISTOGROUPES lists every function held in a group, with its dates.
 *
 * @param codeToGroupId Sénat group code (as in senateurs.json, the same codes as this file) to
 *   ParliamentaryGroup id, as the senators sync has just resolved it.
 */
export async function syncSenateGroupPresidencies(
  codeToGroupId: ReadonlyMap<string, string>
): Promise<GroupPresidenciesSyncStats> {
  const stats = emptyStats();
  try {
    const client = new HTTPClient({ rateLimitMs: SENAT_RATE_LIMIT_MS });
    const { data: buffer } = await client.getBuffer(SENATE_GROUP_PRESIDENCIES_SOURCE_URL);
    const parsed = parseSenateGroupPresidencies(decodeSenateCsv(buffer));
    stats.periodsFound = parsed.periods.length;
    stats.errors.push(...parsed.invalid.map((row) => `Présidence Sénat illisible : ${row}`));

    const politicianIds = await politicianIdsByExternalId(
      DataSource.SENAT,
      parsed.periods.map((period) => period.personRef)
    );
    await writePresidencies(
      DataSource.SENAT,
      SENATE_GROUP_PRESIDENCIES_SOURCE_URL,
      parsed.periods,
      parsed.invalid.length,
      { groupIds: codeToGroupId, politicianIds },
      stats
    );
  } catch (error) {
    stats.errors.push(`Présidences de groupe Sénat : ${String(error)}`);
  }
  return stats;
}
