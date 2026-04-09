import { cacheTag, cacheLife } from "next/cache";
import { db } from "@/lib/db";
import { MANDATE_TYPE_LABELS } from "@/config/labels";
import { getPoliticianVotingStats } from "@/services/voteStats";
import { CATEGORY_MANDATE_TYPES } from "@/types/compare";
import type { CompareCategory } from "@/types/compare";
import type { MandateType } from "@/types";

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export type ComparePreview = {
  slug: string;
  label: string;
  sublabel?: string;
  photoUrl?: string | null;
  color?: string | null;
};

export type VoteForConcordance = {
  scrutinId: string;
  position: string;
  scrutin: {
    id: string;
    title: string;
    slug: string | null;
    votingDate: Date;
  };
};

export type ConcordanceStats = {
  total: number;
  agree: number;
  disagree: number;
  partial: number;
  agreementRate: number; // 0-100
};

export type DivergentVote = {
  scrutinId: string;
  title: string;
  slug: string | null;
  votingDate: Date;
  leftPosition: string;
  rightPosition: string;
};

export type ConcordanceResult = {
  stats: ConcordanceStats;
  recentDivergent: DivergentVote[];
};

// ---------------------------------------------------------------------------
// Pure helper: vote concordance (works for any two vote arrays)
// ---------------------------------------------------------------------------

export function computeVoteConcordance(
  leftVotes: VoteForConcordance[],
  rightVotes: VoteForConcordance[]
): ConcordanceResult {
  const rightMap = new Map(rightVotes.map((v) => [v.scrutinId, v]));
  let agree = 0;
  let disagree = 0;
  let partial = 0;
  const divergent: DivergentVote[] = [];

  for (const lv of leftVotes) {
    const rv = rightMap.get(lv.scrutinId);
    if (!rv) continue;

    if (lv.position === rv.position) {
      agree++;
    } else if (
      (lv.position === "POUR" && rv.position === "CONTRE") ||
      (lv.position === "CONTRE" && rv.position === "POUR")
    ) {
      disagree++;
      divergent.push({
        scrutinId: lv.scrutinId,
        title: lv.scrutin.title,
        slug: lv.scrutin.slug,
        votingDate: lv.scrutin.votingDate,
        leftPosition: lv.position,
        rightPosition: rv.position,
      });
    } else {
      partial++;
    }
  }

  const total = agree + disagree + partial;
  return {
    stats: {
      total,
      agree,
      disagree,
      partial,
      agreementRate: total > 0 ? Math.round((agree / total) * 100) : 0,
    },
    recentDivergent: divergent.slice(0, 5),
  };
}

// ---------------------------------------------------------------------------
// Preview loaders (lightweight, for selectors)
// ---------------------------------------------------------------------------

export async function getPreview(
  cat: CompareCategory,
  slug: string
): Promise<ComparePreview | null> {
  if (cat === "partis") return getPartyPreview(slug);
  if (cat === "groupes") return getGroupPreview(slug);
  return getPoliticianPreview(cat, slug);
}

async function getPoliticianPreview(
  cat: CompareCategory,
  slug: string
): Promise<ComparePreview | null> {
  "use cache";
  cacheTag(`politician:${slug}`);
  cacheLife("minutes");

  const politician = await db.politician.findUnique({
    where: { slug },
    select: {
      slug: true,
      fullName: true,
      photoUrl: true,
      currentParty: { select: { name: true, shortName: true, color: true } },
      mandates: {
        where: { isCurrent: true },
        orderBy: { startDate: "desc" },
        select: { type: true },
      },
    },
  });

  if (!politician) return null;

  // Verify the politician has a mandate matching this category
  const allowedTypes = CATEGORY_MANDATE_TYPES[cat];
  if (allowedTypes) {
    const hasMatch = politician.mandates.some((m) => allowedTypes.includes(m.type));
    if (!hasMatch) return null;
  }

  const mandateLabel = politician.mandates[0]
    ? MANDATE_TYPE_LABELS[politician.mandates[0].type as MandateType]
    : undefined;

  return {
    slug: politician.slug,
    label: politician.fullName,
    sublabel: mandateLabel,
    photoUrl: politician.photoUrl,
    color: politician.currentParty?.color ?? null,
  };
}

async function getPartyPreview(slugOrId: string): Promise<ComparePreview | null> {
  "use cache";
  cacheTag(`party:${slugOrId}`);
  cacheLife("minutes");

  const party = await db.party.findFirst({
    where: { OR: [{ slug: slugOrId }, { id: slugOrId }] },
    select: {
      slug: true,
      name: true,
      shortName: true,
      color: true,
      logoUrl: true,
      _count: { select: { politicians: true } },
    },
  });

  if (!party) return null;

  return {
    slug: party.slug ?? party.name,
    label: party.shortName,
    sublabel: party.name,
    photoUrl: party.logoUrl,
    color: party.color,
  };
}

async function getGroupPreview(idOrCode: string): Promise<ComparePreview | null> {
  "use cache";
  cacheTag("groups");
  cacheLife("minutes");

  const group = await db.parliamentaryGroup.findFirst({
    where: { OR: [{ id: idOrCode }, { code: idOrCode }] },
    select: {
      id: true,
      code: true,
      name: true,
      shortName: true,
      color: true,
      chamber: true,
      _count: { select: { mandates: { where: { mandate: { isCurrent: true } } } } },
    },
  });

  if (!group) return null;

  const chamberLabel = group.chamber === "AN" ? "Assemblée nationale" : "Sénat";

  return {
    slug: group.id,
    label: group.shortName ?? group.code,
    sublabel: `${group.name} (${chamberLabel})`,
    photoUrl: null,
    color: group.color,
  };
}

// ---------------------------------------------------------------------------
// Full comparison data loaders — dispatched by category
// ---------------------------------------------------------------------------

export async function loadComparisonData(cat: CompareCategory, slugA: string, slugB: string) {
  switch (cat) {
    case "deputes":
      return loadPoliticianPair(slugA, slugB, "DEPUTE");
    case "senateurs":
      return loadPoliticianPair(slugA, slugB, "SENATEUR");
    case "ministres":
      return loadMinistrePair(slugA, slugB);
    case "partis":
      return loadPartyPair(slugA, slugB);
    case "groupes":
      return loadGroupPair(slugA, slugB);
  }
}

// ---------------------------------------------------------------------------
// Politician comparison (deputes / senateurs)
// ---------------------------------------------------------------------------

const POLITICIAN_COMPARISON_SELECT = {
  id: true,
  slug: true,
  fullName: true,
  photoUrl: true,
  currentParty: {
    select: {
      id: true,
      name: true,
      shortName: true,
      color: true,
      slug: true,
    },
  },
  _count: { select: { factCheckMentions: { where: { isClaimant: true } } } },
  mandates: {
    orderBy: { startDate: "desc" as const },
    select: {
      type: true,
      title: true,
      isCurrent: true,
      startDate: true,
      endDate: true,
      constituency: true,
      departmentCode: true,
      governmentData: {
        select: { governmentName: true },
      },
      parliamentaryData: {
        select: {
          parliamentaryGroup: {
            select: { name: true, shortName: true, color: true },
          },
        },
      },
    },
  },
  affairs: {
    where: { publicationStatus: "PUBLISHED" as const },
    select: { id: true, status: true, severity: true },
  },
  declarations: {
    orderBy: { year: "desc" as const },
    select: { year: true, type: true, details: true },
  },
  votes: {
    take: 500,
    orderBy: { votingDate: "desc" as const },
    select: {
      position: true,
      scrutinId: true,
      scrutin: {
        select: {
          id: true,
          title: true,
          slug: true,
          votingDate: true,
        },
      },
    },
  },
  factCheckMentions: {
    where: { isClaimant: true },
    take: 20,
    orderBy: { factCheck: { publishedAt: "desc" as const } },
    include: {
      factCheck: { select: { verdictRating: true } },
    },
  },
};

export type PoliticianComparisonData = NonNullable<
  Awaited<ReturnType<typeof getPoliticianForComparison>>
>;

async function getPoliticianForComparison(slug: string, mandateType: string) {
  "use cache";
  cacheTag(`politician:${slug}`, "votes");
  cacheLife("minutes");

  const politician = await db.politician.findUnique({
    where: { slug },
    select: POLITICIAN_COMPARISON_SELECT,
  });

  if (!politician) return null;

  // Verify the politician has the right current mandate
  const currentMandate = politician.mandates.find((m) => m.isCurrent && m.type === mandateType);
  if (!currentMandate) return null;

  // Reuse the single source of truth for vote stats (same as politician profile page)
  const stats = await getPoliticianVotingStats(politician.id, mandateType as MandateType);
  const voteStats = {
    total: stats.total + stats.absent, // eligible scrutins = votes cast + absent
    pour: stats.pour,
    contre: stats.contre,
    abstention: stats.abstention,
    nonVotant: stats.nonVotant,
    absent: stats.absent,
    presenceRate: stats.participationRate,
  };

  return {
    ...politician,
    currentMandate,
    voteStats,
  };
}

async function loadPoliticianPair(slugA: string, slugB: string, mandateType: string) {
  const [left, right] = await Promise.all([
    getPoliticianForComparison(slugA, mandateType),
    getPoliticianForComparison(slugB, mandateType),
  ]);
  if (!left || !right) return null;
  return { left, right };
}

// ---------------------------------------------------------------------------
// Ministre comparison (multiple mandate types, no vote stats)
// ---------------------------------------------------------------------------

const MINISTRE_TYPES = ["MINISTRE", "PREMIER_MINISTRE", "MINISTRE_DELEGUE", "SECRETAIRE_ETAT"];

export type MinistreComparisonData = NonNullable<
  Awaited<ReturnType<typeof getMinistreForComparison>>
>;

async function getMinistreForComparison(slug: string) {
  "use cache";
  cacheTag(`politician:${slug}`);
  cacheLife("minutes");

  const politician = await db.politician.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      fullName: true,
      photoUrl: true,
      currentParty: {
        select: {
          id: true,
          name: true,
          shortName: true,
          color: true,
          slug: true,
        },
      },
      _count: { select: { factCheckMentions: { where: { isClaimant: true } } } },
      mandates: {
        orderBy: { startDate: "desc" },
        select: {
          type: true,
          title: true,
          isCurrent: true,
          startDate: true,
          endDate: true,
          governmentData: {
            select: { governmentName: true },
          },
          constituency: true,
          departmentCode: true,
          parliamentaryData: {
            select: {
              parliamentaryGroup: {
                select: { name: true, shortName: true, color: true },
              },
            },
          },
        },
      },
      affairs: {
        where: { publicationStatus: "PUBLISHED" },
        select: { id: true, status: true, severity: true },
      },
      declarations: {
        orderBy: { year: "desc" },
        select: { year: true, type: true, details: true },
      },
      factCheckMentions: {
        where: { isClaimant: true },
        take: 20,
        orderBy: { factCheck: { publishedAt: "desc" } },
        include: {
          factCheck: { select: { verdictRating: true } },
        },
      },
    },
  });

  if (!politician) return null;

  // Verify has a current minister-type mandate
  const currentMandate = politician.mandates.find(
    (m) => m.isCurrent && MINISTRE_TYPES.includes(m.type)
  );
  if (!currentMandate) return null;

  return {
    ...politician,
    currentMandate,
  };
}

async function loadMinistrePair(slugA: string, slugB: string) {
  const [left, right] = await Promise.all([
    getMinistreForComparison(slugA),
    getMinistreForComparison(slugB),
  ]);
  if (!left || !right) return null;
  return { left, right };
}

// ---------------------------------------------------------------------------
// Party comparison
// ---------------------------------------------------------------------------

export type PartyComparisonData = NonNullable<Awaited<ReturnType<typeof getPartyForComparison>>>;

async function getPartyForComparison(slugOrId: string) {
  "use cache";
  cacheTag(`party:${slugOrId}`);
  cacheLife("minutes");

  const party = await db.party.findFirst({
    where: { OR: [{ slug: slugOrId }, { id: slugOrId }] },
    select: {
      id: true,
      slug: true,
      name: true,
      shortName: true,
      color: true,
      logoUrl: true,
      foundedDate: true,
      politicalPosition: true,
      ideology: true,
      _count: { select: { politicians: true } },
    },
  });

  if (!party) return null;

  // Current mandates by type for members
  const mandateCounts = await db.mandate.groupBy({
    by: ["type"],
    where: {
      isCurrent: true,
      politician: { currentPartyId: party.id },
    },
    _count: true,
  });

  // Published affairs of members (bounded)
  const affairs = await db.affair.findMany({
    where: {
      publicationStatus: "PUBLISHED",
      politician: { currentPartyId: party.id },
    },
    select: { id: true, status: true, severity: true },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });

  // Fact-check citations (isClaimant) of party members (bounded)
  const factCheckMentions = await db.factCheckMention.findMany({
    where: { isClaimant: true, politician: { currentPartyId: party.id } },
    include: {
      factCheck: { select: { verdictRating: true } },
    },
    orderBy: { factCheck: { publishedAt: "desc" } },
    take: 200,
  });

  return {
    party: {
      ...party,
      memberCount: party._count.politicians,
    },
    mandateCounts: mandateCounts.map((m) => ({
      type: m.type as MandateType,
      count: m._count,
    })),
    affairs,
    factCheckMentions,
  };
}

// Raw SQL for party-level majority-position comparison
interface PartyMajorityVoteRow {
  scrutinId: string;
  title: string;
  slug: string | null;
  votingDate: Date;
  majorityPosition: string;
  pour: bigint;
  contre: bigint;
  abstention: bigint;
}

export async function getPartyVoteComparison(leftPartyId: string, rightPartyId: string) {
  "use cache";
  cacheTag("votes");
  cacheLife("minutes");

  const [leftRows, rightRows] = await Promise.all([
    db.$queryRaw<PartyMajorityVoteRow[]>`
      SELECT
        v."scrutinId" as "scrutinId",
        s.title,
        s.slug,
        s."votingDate" as "votingDate",
        SUM(CASE WHEN v.position = 'POUR' THEN 1 ELSE 0 END)::bigint as "pour",
        SUM(CASE WHEN v.position = 'CONTRE' THEN 1 ELSE 0 END)::bigint as "contre",
        SUM(CASE WHEN v.position = 'ABSTENTION' THEN 1 ELSE 0 END)::bigint as "abstention",
        CASE
          WHEN SUM(CASE WHEN v.position = 'POUR' THEN 1 ELSE 0 END) >= SUM(CASE WHEN v.position = 'CONTRE' THEN 1 ELSE 0 END)
           AND SUM(CASE WHEN v.position = 'POUR' THEN 1 ELSE 0 END) >= SUM(CASE WHEN v.position = 'ABSTENTION' THEN 1 ELSE 0 END)
          THEN 'POUR'
          WHEN SUM(CASE WHEN v.position = 'CONTRE' THEN 1 ELSE 0 END) >= SUM(CASE WHEN v.position = 'ABSTENTION' THEN 1 ELSE 0 END)
          THEN 'CONTRE'
          ELSE 'ABSTENTION'
        END as "majorityPosition"
      FROM "Vote" v
      JOIN "Politician" pol ON v."politicianId" = pol.id
      JOIN "Scrutin" s ON v."scrutinId" = s.id
      WHERE pol."currentPartyId" = ${leftPartyId}
        AND v.position IN ('POUR', 'CONTRE', 'ABSTENTION')
      GROUP BY v."scrutinId", s.title, s.slug, s."votingDate"
    `,
    db.$queryRaw<PartyMajorityVoteRow[]>`
      SELECT
        v."scrutinId" as "scrutinId",
        s.title,
        s.slug,
        s."votingDate" as "votingDate",
        SUM(CASE WHEN v.position = 'POUR' THEN 1 ELSE 0 END)::bigint as "pour",
        SUM(CASE WHEN v.position = 'CONTRE' THEN 1 ELSE 0 END)::bigint as "contre",
        SUM(CASE WHEN v.position = 'ABSTENTION' THEN 1 ELSE 0 END)::bigint as "abstention",
        CASE
          WHEN SUM(CASE WHEN v.position = 'POUR' THEN 1 ELSE 0 END) >= SUM(CASE WHEN v.position = 'CONTRE' THEN 1 ELSE 0 END)
           AND SUM(CASE WHEN v.position = 'POUR' THEN 1 ELSE 0 END) >= SUM(CASE WHEN v.position = 'ABSTENTION' THEN 1 ELSE 0 END)
          THEN 'POUR'
          WHEN SUM(CASE WHEN v.position = 'CONTRE' THEN 1 ELSE 0 END) >= SUM(CASE WHEN v.position = 'ABSTENTION' THEN 1 ELSE 0 END)
          THEN 'CONTRE'
          ELSE 'ABSTENTION'
        END as "majorityPosition"
      FROM "Vote" v
      JOIN "Politician" pol ON v."politicianId" = pol.id
      JOIN "Scrutin" s ON v."scrutinId" = s.id
      WHERE pol."currentPartyId" = ${rightPartyId}
        AND v.position IN ('POUR', 'CONTRE', 'ABSTENTION')
      GROUP BY v."scrutinId", s.title, s.slug, s."votingDate"
    `,
  ]);

  const rightMap = new Map(rightRows.map((r) => [r.scrutinId, r]));

  return leftRows
    .filter((l) => rightMap.has(l.scrutinId))
    .map((l) => {
      const r = rightMap.get(l.scrutinId)!;
      return {
        scrutinId: l.scrutinId,
        title: l.title,
        slug: l.slug,
        votingDate: l.votingDate,
        leftPosition: l.majorityPosition,
        rightPosition: r.majorityPosition,
        leftPour: Number(l.pour),
        leftContre: Number(l.contre),
        leftAbstention: Number(l.abstention),
        rightPour: Number(r.pour),
        rightContre: Number(r.contre),
        rightAbstention: Number(r.abstention),
      };
    });
}

export type PartyVoteComparisonRow = Awaited<ReturnType<typeof getPartyVoteComparison>>[number];

async function loadPartyPair(slugA: string, slugB: string) {
  const [left, right] = await Promise.all([
    getPartyForComparison(slugA),
    getPartyForComparison(slugB),
  ]);
  if (!left || !right) return null;

  const voteComparison = await getPartyVoteComparison(left.party.id, right.party.id);

  return { left, right, voteComparison };
}

// ---------------------------------------------------------------------------
// Group comparison
// ---------------------------------------------------------------------------

export type GroupComparisonData = NonNullable<Awaited<ReturnType<typeof getGroupForComparison>>>;

async function getGroupForComparison(idOrCode: string) {
  "use cache";
  cacheTag("groups", "votes");
  cacheLife("minutes");

  const group = await db.parliamentaryGroup.findFirst({
    where: { OR: [{ id: idOrCode }, { code: idOrCode }] },
    include: {
      defaultParty: {
        select: { name: true, shortName: true, color: true, slug: true },
      },
      _count: {
        select: { mandates: { where: { mandate: { isCurrent: true } } } },
      },
    },
  });

  if (!group) return null;

  // Get member votes through current mandates
  const memberMandates = await db.mandate.findMany({
    where: { parliamentaryData: { parliamentaryGroupId: group.id }, isCurrent: true },
    select: {
      politician: {
        select: {
          id: true,
          votes: {
            take: 500,
            orderBy: { votingDate: "desc" },
            select: {
              position: true,
              scrutinId: true,
            },
          },
        },
      },
    },
  });

  // Deduplicate politicians (a politician might have multiple mandates)
  const seenIds = new Set<string>();
  const uniqueMembers = memberMandates.filter((m) => {
    if (seenIds.has(m.politician.id)) return false;
    seenIds.add(m.politician.id);
    return true;
  });

  // Aggregate vote stats across all members
  const totalVotes = uniqueMembers.reduce((sum, m) => sum + m.politician.votes.length, 0);
  const activeVotes = uniqueMembers.reduce(
    (sum, m) =>
      sum +
      m.politician.votes.filter(
        (v) => v.position === "POUR" || v.position === "CONTRE" || v.position === "ABSTENTION"
      ).length,
    0
  );

  const avgParticipation = totalVotes > 0 ? Math.round((activeVotes / totalVotes) * 100) : 0;

  // Compute internal cohesion: for each scrutin, what % of members voted
  // like the group majority
  const scrutinVotes = new Map<string, string[]>();
  for (const m of uniqueMembers) {
    for (const v of m.politician.votes) {
      if (!["POUR", "CONTRE", "ABSTENTION"].includes(v.position)) continue;
      const arr = scrutinVotes.get(v.scrutinId) ?? [];
      arr.push(v.position);
      scrutinVotes.set(v.scrutinId, arr);
    }
  }

  let cohesionSum = 0;
  let cohesionCount = 0;
  for (const [, positions] of scrutinVotes) {
    if (positions.length < 2) continue;
    // Find majority position
    const counts: Record<string, number> = {};
    for (const p of positions) counts[p] = (counts[p] || 0) + 1;
    const maxCount = Math.max(...Object.values(counts));
    cohesionSum += maxCount / positions.length;
    cohesionCount++;
  }

  const cohesionRate = cohesionCount > 0 ? Math.round((cohesionSum / cohesionCount) * 100) : 0;

  // Get published affairs of group members
  const affairs = await db.affair.findMany({
    where: {
      publicationStatus: "PUBLISHED",
      politician: {
        mandates: {
          some: {
            parliamentaryData: { parliamentaryGroupId: group.id },
            isCurrent: true,
          },
        },
      },
    },
    select: { id: true, status: true, severity: true },
    take: 500,
  });

  // Get fact-check citations (isClaimant) of group members
  const factCheckMentions = await db.factCheckMention.findMany({
    where: {
      isClaimant: true,
      politician: {
        mandates: {
          some: {
            parliamentaryData: { parliamentaryGroupId: group.id },
            isCurrent: true,
          },
        },
      },
    },
    include: {
      factCheck: { select: { verdictRating: true } },
    },
    take: 500,
  });

  return {
    group: {
      ...group,
      memberCount: group._count.mandates,
    },
    stats: {
      avgParticipation,
      cohesionRate,
      totalVotes,
    },
    affairs,
    factCheckMentions,
  };
}

async function loadGroupPair(slugA: string, slugB: string) {
  const [left, right] = await Promise.all([
    getGroupForComparison(slugA),
    getGroupForComparison(slugB),
  ]);
  if (!left || !right) return null;
  return { left, right };
}
