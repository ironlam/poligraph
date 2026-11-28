import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma";
import {
  censureArticle,
  governmentAt,
  MOTION_DE_CENSURE_CODE,
  requiredMajority,
  type CensureArticle,
  type GovernmentPeriod,
} from "@/lib/votes/motions-de-censure";

/**
 * Data of /parlement/motions-de-censure: every motion de censure voted at the Assemblée nationale
 * that the base holds (XVIe and XVIIe legislatures, from July 2022), with the AN's own counts per
 * group. Counts and links only, read from the base; no text is generated.
 */

export interface CensureMotion {
  slug: string;
  /** Official AN title, as published. */
  title: string;
  votingDate: Date;
  legislature: number;
  votesFor: number;
  /** Majority required on the day, see `requiredMajority`. */
  requiredMajority: number | null;
  adopted: boolean;
  article: CensureArticle | null;
  government: { slug: string; name: string } | null;
  sourceUrl: string | null;
}

export interface CensureGroupRow {
  organeRef: string;
  label: string;
  abbreviation: string | null;
  /** Motions voted while the group existed (the AN lists it on the scrutin). */
  motionsDuringGroup: number;
  /** Of those, motions with at least one vote for from the group. */
  motionsWithVotes: number;
  votesFor: number;
}

export interface CensureDeputyRow {
  slug: string;
  fullName: string;
  /** Motions of the legislature the deputy voted for. */
  count: number;
}

export interface CensureLegislature {
  legislature: number;
  motions: CensureMotion[];
  groups: CensureGroupRow[];
  deputies: CensureDeputyRow[];
}

export interface MotionsDeCensureData {
  total: number;
  adopted: number;
  /** Most recent first. */
  legislatures: CensureLegislature[];
}

interface MotionRow {
  slug: string;
  title: string;
  votingDate: Date;
  legislature: number;
  votesFor: number;
  result: string;
  sourceUrl: string | null;
  seats: number[] | null;
}

async function queryMotions(): Promise<MotionRow[]> {
  return db.$queryRaw<MotionRow[]>(Prisma.sql`
    SELECT s."slug", s."title", s."votingDate", s."legislature", s."votesFor",
           s."result"::text AS "result", s."sourceUrl",
           ARRAY(SELECT c."memberCount" FROM "ScrutinOfficialGroupCount" c
                 WHERE c."scrutinId" = s."id") AS "seats"
    FROM "Scrutin" s
    WHERE s."chamber" = 'AN' AND s."codeTypeVote" = ${MOTION_DE_CENSURE_CODE}
      AND s."slug" IS NOT NULL
    ORDER BY s."votingDate" DESC, s."sequence" DESC
  `);
}

async function queryGovernments(): Promise<GovernmentPeriod[]> {
  const rows = await db.government.findMany({
    where: { publicationStatus: "PUBLISHED" },
    select: { slug: true, name: true, primeMinisterAppointedAt: true },
  });
  return rows.map((g) => ({ slug: g.slug, name: g.name, appointedAt: g.primeMinisterAppointedAt }));
}

async function queryGroups(): Promise<Array<CensureGroupRow & { legislature: number }>> {
  return db.$queryRaw(Prisma.sql`
    SELECT s."legislature", c."organeRef", a."label", a."abbreviation",
           COUNT(*)::int AS "motionsDuringGroup",
           (COUNT(*) FILTER (WHERE COALESCE(c."forCount", 0) > 0))::int AS "motionsWithVotes",
           COALESCE(SUM(c."forCount"), 0)::int AS "votesFor"
    FROM "ScrutinOfficialGroupCount" c
    JOIN "Scrutin" s ON s."id" = c."scrutinId"
    JOIN "AnOrgan" a ON a."organeRef" = c."organeRef"
    WHERE s."chamber" = 'AN' AND s."codeTypeVote" = ${MOTION_DE_CENSURE_CODE}
    GROUP BY s."legislature", c."organeRef", a."label", a."abbreviation"
  `);
}

async function queryDeputies(): Promise<Array<CensureDeputyRow & { legislature: number }>> {
  return db.$queryRaw(Prisma.sql`
    SELECT s."legislature", p."slug", p."fullName", COUNT(*)::int AS "count"
    FROM "Vote" v
    JOIN "Scrutin" s ON s."id" = v."scrutinId"
    JOIN "Politician" p ON p."id" = v."politicianId"
    WHERE s."chamber" = 'AN' AND s."codeTypeVote" = ${MOTION_DE_CENSURE_CODE}
      AND v."position" = 'POUR' AND p."publicationStatus" = 'PUBLISHED'
    GROUP BY s."legislature", p."id", p."slug", p."fullName", p."lastName"
    ORDER BY COUNT(*) DESC, p."lastName" ASC, p."fullName" ASC
  `);
}

/** Pure assembly of the rows, exported for the tests. */
export function buildMotionsDeCensure(
  motions: MotionRow[],
  governments: GovernmentPeriod[],
  groups: Array<CensureGroupRow & { legislature: number }>,
  deputies: Array<CensureDeputyRow & { legislature: number }>
): MotionsDeCensureData {
  const byLegislature = new Map<number, CensureLegislature>();
  const legislatureOf = (n: number) => {
    let entry = byLegislature.get(n);
    if (!entry) {
      entry = { legislature: n, motions: [], groups: [], deputies: [] };
      byLegislature.set(n, entry);
    }
    return entry;
  };

  for (const m of motions) {
    const gov = governmentAt(m.votingDate, governments);
    legislatureOf(m.legislature).motions.push({
      slug: m.slug,
      title: m.title,
      votingDate: m.votingDate,
      legislature: m.legislature,
      votesFor: m.votesFor,
      requiredMajority: requiredMajority(m.seats ?? []),
      adopted: m.result === "ADOPTED",
      article: censureArticle(m.title),
      government: gov ? { slug: gov.slug, name: gov.name } : null,
      sourceUrl: m.sourceUrl,
    });
  }
  for (const { legislature, ...group } of groups) legislatureOf(legislature).groups.push(group);
  for (const { legislature, ...deputy } of deputies)
    legislatureOf(legislature).deputies.push(deputy);

  for (const entry of byLegislature.values()) {
    // Alphabetical: the same order for every group, whatever its count.
    entry.groups.sort((a, b) => a.label.localeCompare(b.label, "fr"));
  }

  return {
    total: motions.length,
    adopted: motions.filter((m) => m.result === "ADOPTED").length,
    legislatures: [...byLegislature.values()].sort((a, b) => b.legislature - a.legislature),
  };
}

export async function getMotionsDeCensure(): Promise<MotionsDeCensureData> {
  "use cache";
  cacheTag("votes", "gouvernements");
  cacheLife("synced");

  const motions = await queryMotions();
  const governments = await queryGovernments();
  const groups = await queryGroups();
  const deputies = await queryDeputies();
  return buildMotionsDeCensure(motions, governments, groups, deputies);
}
