import { DataSource, Judgement, Prisma } from "@/generated/prisma";
import { MANDAT_BY_LABEL } from "@/config/parrainages";
import { db } from "@/lib/db";
import { resolveBatch } from "@/lib/identity";
import { requestProfileRefresh } from "@/lib/politicians/profile-snapshot/request";
import {
  MANDATE_SCOPE,
  matchElu,
  summarizeEluMatches,
  type EluMatch,
  type ElusReport,
  type MandateHolder,
} from "./parrainages-elus";

/**
 * Links the stored presentations to the `Politician` who made them. Preview by default. With
 * `write`, only the LINK verdicts are written: `Parrainage.politicianId`, and one SAME identity
 * decision per link as its audit trail. Everything else stays as published, with no review queue.
 * A presentation already linked is never revisited.
 */

const DECIDED_BY = "system:sync-parrainages-elus";
const CHUNK = 500;

export const parrainageSourceId = (dedupeKey: string) => `parrainage:${dedupeKey}`;

export interface ElusLinkReport {
  electionSlug: string;
  /** Presentations of the election not linked yet. */
  examined: number;
  alreadyLinked: number;
  byMandat: Record<string, ElusReport>;
  /** Distinct politicians the LINK verdicts point to. */
  politicians: number;
  written: number;
}

export async function linkParrainagesElus(
  electionSlug: string,
  options: { write: boolean }
): Promise<ElusLinkReport> {
  const where = { election: { slug: electionSlug } };
  const [rows, alreadyLinked] = await Promise.all([
    db.parrainage.findMany({
      where: { ...where, politicianId: null },
      select: {
        id: true,
        dedupeKey: true,
        civility: true,
        lastName: true,
        firstName: true,
        mandateLabel: true,
        communeCode: true,
        departmentCode: true,
        publishedOn: true,
      },
    }),
    db.parrainage.count({ where: { ...where, politicianId: { not: null } } }),
  ]);
  const report: ElusLinkReport = {
    electionSlug,
    examined: rows.length,
    alreadyLinked,
    byMandat: {},
    politicians: 0,
    written: 0,
  };
  if (!rows.length) return report;

  const dates = rows.map((row) => row.publishedOn.getTime());
  const types = [...new Set(Object.values(MANDATE_SCOPE).flatMap((scope) => scope.types))];
  const mandates = await db.mandate.findMany({
    where: {
      type: { in: types },
      startDate: { lte: new Date(Math.max(...dates)) },
      OR: [{ endDate: null }, { endDate: { gte: new Date(Math.min(...dates)) } }],
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
  });
  // One pool per commune for mayors, one per mandate type for the others.
  const pools = new Map<string, MandateHolder[]>();
  for (const m of mandates) {
    const communeId = m.localData?.communeId ?? null;
    const key = communeId ? `${m.type}\t${communeId}` : m.type;
    const holder: MandateHolder = {
      politicianId: m.politicianId,
      firstName: m.politician.firstName,
      lastName: m.politician.lastName,
      type: m.type,
      communeId,
      departmentCode: m.departmentCode,
      startDate: m.startDate,
      endDate: m.endDate,
    };
    pools.set(key, [...(pools.get(key) ?? []), holder]);
  }

  // Read-only pass: the decisions worth keeping are written below, for the LINK verdicts only.
  const { results } = await resolveBatch({
    sourceType: DataSource.CONSEIL_CONSTITUTIONNEL,
    persist: false,
    inputs: rows.map((row) => ({
      firstName: row.firstName,
      lastName: row.lastName,
      gender: row.civility === "Mme" ? "F" : "M",
      department: row.departmentCode ?? undefined,
      source: DataSource.CONSEIL_CONSTITUTIONNEL,
      sourceId: parrainageSourceId(row.dedupeKey),
    })),
  });
  const sameBySourceId = new Map(
    results.filter((r) => r.decision === Judgement.SAME).map((r) => [r.sourceId, r])
  );

  const matchesByMandat = new Map<string, EluMatch[]>();
  const links: {
    id: string;
    politicianId: string;
    decision: Prisma.IdentityDecisionCreateManyInput;
  }[] = [];
  for (const row of rows) {
    const mandat = MANDAT_BY_LABEL[row.mandateLabel] ?? null;
    const scope = mandat ? MANDATE_SCOPE[mandat] : undefined;
    const pool = !scope
      ? []
      : scope.territory === "COMMUNE"
        ? (pools.get(`${scope.types[0]}\t${row.communeCode}`) ?? [])
        : scope.types.flatMap((type) => pools.get(type) ?? []);
    const sourceId = parrainageSourceId(row.dedupeKey);
    const same = sameBySourceId.get(sourceId);
    const match = matchElu(
      { ...row, mandat, publishedOn: row.publishedOn.toISOString().slice(0, 10) },
      row,
      pool,
      same?.politicianId ?? null
    );
    const label = mandat ?? "INCONNU";
    matchesByMandat.set(label, [...(matchesByMandat.get(label) ?? []), match]);
    if (match.verdict === "LINK" && match.politicianId && same) {
      links.push({
        id: row.id,
        politicianId: match.politicianId,
        decision: {
          sourceType: DataSource.CONSEIL_CONSTITUTIONNEL,
          sourceId,
          politicianId: match.politicianId,
          judgement: Judgement.SAME,
          confidence: same.confidence,
          method: same.method,
          evidence: { rule: "mandate-territory-date-name", mandat, electionSlug },
          decidedBy: DECIDED_BY,
        },
      });
    }
  }
  report.byMandat = Object.fromEntries(
    [...matchesByMandat].map(([mandat, list]) => [mandat, summarizeEluMatches(list)])
  );
  const politicianIds = [...new Set(links.map((link) => link.politicianId))];
  report.politicians = politicianIds.length;
  if (!options.write || !links.length) return report;

  await db.$transaction(
    async (tx) => {
      for (let i = 0; i < links.length; i += CHUNK) {
        const chunk = links.slice(i, i + CHUNK);
        await tx.identityDecision.createMany({ data: chunk.map((link) => link.decision) });
        await tx.$executeRaw(Prisma.sql`
          UPDATE "Parrainage" AS p SET "politicianId" = v."politicianId"
          FROM (VALUES ${Prisma.join(
            chunk.map((link) => Prisma.sql`(${link.id}, ${link.politicianId})`)
          )}) AS v("id", "politicianId")
          WHERE p."id" = v."id" AND p."politicianId" IS NULL
        `);
      }
    },
    { timeout: 120_000 }
  );
  report.written = links.length;
  await requestProfileRefresh({ politicianIds }, "sync:parrainages-elus");
  return report;
}
