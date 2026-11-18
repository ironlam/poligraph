/**
 * Read-only report: how many presidential presentations can be linked to a `Politician`, by
 * mandate, territory and date, then confirmed by the identity resolver. Writes nothing.
 *
 * Usage :
 *   npm run audit:parrainages-elus -- --election=presidentielle-2022
 */
import "dotenv/config";
import { DataSource, Judgement } from "@/generated/prisma";
import { DEPARTMENTS } from "@/config/departments";
import { db } from "@/lib/db";
import { resolveBatch } from "@/lib/identity";
import { downloadBuffer } from "@/services/sync/csv-download";
import { PARRAINAGES_SOURCES } from "@/services/sync/parrainages";
import {
  MANDATE_SCOPE,
  matchElu,
  summarizeEluMatches,
  type EluMatch,
  type MandateHolder,
} from "@/services/sync/parrainages-elus";
import { parseParrainagesCsv } from "@/services/sync/parrainages-parse";
import {
  buildTerritoryIndex,
  resolveParrainageTerritory,
} from "@/services/sync/parrainages-territoires";

async function main() {
  const election = process.argv.find((a) => a.startsWith("--election="))?.slice(11) ?? "";
  const sourceUrl = PARRAINAGES_SOURCES[election];
  if (!sourceUrl) {
    throw new Error(`--election attendu : ${Object.keys(PARRAINAGES_SOURCES).join(", ")}`);
  }
  console.log(`Rapprochement des élus, ${election} [LECTURE SEULE]`);

  const { rows } = parseParrainagesCsv((await downloadBuffer(sourceUrl)).toString("utf8"));
  const dates = rows.map((row) => row.publishedOn).sort();
  const first = new Date(`${dates[0]}T00:00:00Z`);
  const last = new Date(`${dates[dates.length - 1]}T00:00:00Z`);
  const types = [...new Set(Object.values(MANDATE_SCOPE).flatMap((scope) => scope.types))];

  const [communes, mandates] = await Promise.all([
    db.commune.findMany({ select: { id: true, name: true, departmentCode: true } }),
    db.mandate.findMany({
      where: {
        type: { in: types },
        startDate: { lte: last },
        OR: [{ endDate: null }, { endDate: { gte: first } }],
      },
      select: {
        politicianId: true,
        type: true,
        departmentCode: true,
        startDate: true,
        endDate: true,
        localData: { select: { communeId: true } },
        politician: { select: { firstName: true, lastName: true } },
      },
    }),
  ]);
  const holders: MandateHolder[] = mandates.map((m) => ({
    politicianId: m.politicianId,
    firstName: m.politician.firstName,
    lastName: m.politician.lastName,
    type: m.type,
    communeId: m.localData?.communeId ?? null,
    departmentCode: m.departmentCode,
    startDate: m.startDate,
    endDate: m.endDate,
  }));
  const byType = new Map<string, MandateHolder[]>();
  for (const holder of holders) {
    const scope = holder.communeId ? `${holder.type}\t${holder.communeId}` : holder.type;
    byType.set(scope, [...(byType.get(scope) ?? []), holder]);
  }

  const index = buildTerritoryIndex(DEPARTMENTS, communes);
  const territories = rows.map((row) => resolveParrainageTerritory(row, index));
  // MANUAL only scopes the lookup of prior decisions; with persist false nothing is written.
  const { results } = await resolveBatch({
    sourceType: DataSource.MANUAL,
    persist: false,
    inputs: rows.map((row, i) => ({
      firstName: row.firstName,
      lastName: row.lastName,
      gender: row.civility === "Mme" ? "F" : "M",
      department: territories[i]!.departmentCode ?? undefined,
      source: DataSource.MANUAL,
      sourceId: `parrainage-audit:${election}:${row.line}`,
    })),
  });
  const sameById = new Map(
    results.filter((r) => r.decision === Judgement.SAME).map((r) => [r.sourceId, r.politicianId])
  );

  const matches = new Map<string, EluMatch[]>();
  const samples = new Map<string, string[]>();
  rows.forEach((row, i) => {
    const territory = territories[i]!;
    const scope = row.mandat ? MANDATE_SCOPE[row.mandat] : undefined;
    const pool = !scope
      ? []
      : scope.territory === "COMMUNE"
        ? (byType.get(`${scope.types[0]}\t${territory.communeCode}`) ?? [])
        : scope.types.flatMap((type) => byType.get(type) ?? []);
    const same = sameById.get(`parrainage-audit:${election}:${row.line}`) ?? null;
    const match = matchElu(row, territory, pool, same);
    const mandat = row.mandat ?? "INCONNU";
    matches.set(mandat, [...(matches.get(mandat) ?? []), match]);
    const sampleKey = `${match.verdict} / ${match.reason}`;
    const list = samples.get(sampleKey) ?? [];
    if (list.length < 5 && match.verdict !== "HORS_PERIMETRE" && match.verdict !== "LINK") {
      list.push(
        `${row.firstName} ${row.lastName}, ${row.mandateLabel}, ${row.constituencyLabel || row.departmentLabel}`
      );
    }
    samples.set(sampleKey, list);
  });

  console.log(
    `  présentations : ${rows.length}, mandats datés en base sur la période : ${holders.length}`
  );
  console.table(
    Object.fromEntries([...matches].map(([mandat, list]) => [mandat, summarizeEluMatches(list)]))
  );
  for (const [reason, list] of samples) {
    if (list.length) console.log(`\n  ${reason}\n    ${list.join("\n    ")}`);
  }
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
