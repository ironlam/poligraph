import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/lib/db";
import { PUBLIC_POLITICIAN_WHERE } from "@/lib/api/public-contract";
import { SCRUTIN_TYPE_LABELS, VOTING_RESULT_LABELS } from "@/config/labels";
import { SCRUTIN_RECENT_FIRST } from "@/lib/votes/scrutin-order";
import { displayTitleOf, toPublicTitleView } from "@/lib/votes/to-public-title-view";
import type { PositionEnregistree } from "@/lib/territoires/votes-parlementaires";

/**
 * Reader of « Vos parlementaires ont voté » (Territoires v2, D26): the three latest scrutins of
 * the Assemblée nationale that decide a text or a motion, with the position of each current
 * deputy of one department. The selection is the same for every territory: type and date only,
 * never `isKeyVote`, never a theme, never a party.
 */

export interface ScrutinTerritoire {
  slug: string;
  /** Approved explanatory title, the official title otherwise. */
  titre: string;
  /** Nature of the vote, as the site labels the type. */
  nature: string;
  /** « Adopté » or « Rejeté ». */
  resultat: string;
  /** ISO date (yyyy-mm-dd). */
  date: string;
  /** Recorded position by deputy slug. A deputy without an entry has no recorded position. */
  positions: Record<string, PositionEnregistree>;
  /**
   * Deputies with no entry who provably did not vote: they sat on that day, and the positions
   * recorded for the scrutin add up to its official totals. Empty when the totals differ.
   */
  sansVote: string[];
}

export interface VotesDeputes {
  scrutins: ScrutinTerritoire[];
  /** Slugs of the current deputies of the department with a public profile. */
  deputeSlugs: string[];
}

export const VOTES_TERRITOIRE_LIMIT = 3;

/** One entry per department: the commune pages of a department all read the same one. */
export async function getVotesDeputesDepartement(departmentCode: string): Promise<VotesDeputes> {
  "use cache";
  cacheLife("synced");
  cacheTag("votes", "politicians", `territoire:${departmentCode}`);

  const [scrutins, deputes] = await Promise.all([
    db.scrutin.findMany({
      where: { chamber: "AN", type: { in: ["FINAL", "MOTION"] }, slug: { not: null } },
      orderBy: SCRUTIN_RECENT_FIRST,
      take: VOTES_TERRITOIRE_LIMIT,
      select: {
        id: true,
        slug: true,
        title: true,
        type: true,
        votingDate: true,
        result: true,
        votesFor: true,
        votesAgainst: true,
        votesAbstain: true,
        chamber: true,
        sourceUrl: true,
        policyTitle: {
          select: {
            status: true,
            policyTitle: true,
            policySubtitle: true,
            officialSourceUrl: true,
            proceduralLabel: true,
          },
        },
      },
    }),
    db.politician.findMany({
      where: {
        ...PUBLIC_POLITICIAN_WHERE,
        mandates: { some: { type: "DEPUTE", isCurrent: true, departmentCode } },
      },
      select: {
        id: true,
        slug: true,
        mandates: {
          where: { type: "DEPUTE", isCurrent: true, departmentCode },
          select: { startDate: true },
          take: 1,
        },
      },
      take: 60,
    }),
  ]);

  const slugById = new Map(deputes.map((d) => [d.id, d.slug]));
  const votes =
    scrutins.length > 0 && deputes.length > 0
      ? await db.vote.findMany({
          where: {
            scrutinId: { in: scrutins.map((s) => s.id) },
            politicianId: { in: deputes.map((d) => d.id) },
          },
          select: { scrutinId: true, politicianId: true, position: true },
        })
      : [];

  // Official totals against the positions we hold, per scrutin: only a match proves that a
  // deputy without an entry did not vote (measured 2026-11-15: 194 of 320 scrutins match).
  const recorded =
    scrutins.length > 0
      ? await db.vote.groupBy({
          by: ["scrutinId", "position"],
          where: { scrutinId: { in: scrutins.map((s) => s.id) } },
          _count: { _all: true },
        })
      : [];
  const recordedCount = (scrutinId: string, position: PositionEnregistree) =>
    recorded.find((r) => r.scrutinId === scrutinId && r.position === position)?._count._all ?? 0;

  return {
    deputeSlugs: deputes.map((d) => d.slug),
    scrutins: scrutins.map((s) => {
      const positions: Record<string, PositionEnregistree> = {};
      for (const v of votes) {
        const slug = slugById.get(v.politicianId);
        if (v.scrutinId === s.id && slug) positions[slug] = v.position;
      }
      const complet =
        recordedCount(s.id, "POUR") === s.votesFor &&
        recordedCount(s.id, "CONTRE") === s.votesAgainst &&
        recordedCount(s.id, "ABSTENTION") === s.votesAbstain;
      const sansVote = complet
        ? deputes
            .filter((d) => !positions[d.slug])
            .filter((d) => {
              const start = d.mandates[0]?.startDate;
              return !!start && start <= s.votingDate;
            })
            .map((d) => d.slug)
        : [];
      return {
        sansVote,
        resultat: VOTING_RESULT_LABELS[s.result],
        slug: s.slug!,
        titre: displayTitleOf(toPublicTitleView(s)),
        nature: s.type ? SCRUTIN_TYPE_LABELS[s.type] : "",
        date: s.votingDate.toISOString().slice(0, 10),
        positions,
      };
    }),
  };
}
