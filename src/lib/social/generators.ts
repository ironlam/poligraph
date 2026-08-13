import { db } from "@/lib/db";
import {
  AFFAIR_STATUS_LABELS,
  AFFAIR_STATUS_NEEDS_PRESUMPTION,
  AFFAIR_CATEGORY_LABELS,
  FACTCHECK_ALLOWED_SOURCES,
  MANDATE_TYPE_LABELS,
} from "@/config/labels";
import { SITE_URL } from "./config";
import type { RecentlyPosted } from "./dedup";
import { wasRecentlyPosted } from "./dedup";

// --- Types ---

export interface TweetDraft {
  content: string;
  link?: string;
  entityId?: string;
}

// --- Helpers ---

export function daysUntil(date: Date): number {
  const now = new Date();
  return Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export function plural(n: number, singular: string, pluralForm?: string): string {
  return n <= 1 ? singular : pluralForm || singular + "s";
}

export const VERDICT_LABELS: Record<string, string> = {
  TRUE: "vrai",
  MOSTLY_TRUE: "plutôt vrai",
  HALF_TRUE: "à nuancer",
  MISLEADING: "trompeur",
  OUT_OF_CONTEXT: "hors contexte",
  MOSTLY_FALSE: "plutôt faux",
  FALSE: "faux",
  UNVERIFIABLE: "invérifiable",
};

// --- Methodo static topics ---

const METHODO_TOPICS = [
  {
    slug: "identity-resolution",
    content: `🔧 Comment Poligraph relie un député à ses affaires judiciaires ?\n\nMatching par nom, identifiant Wikidata (Q-ID), seuil de confiance à 95%. Les homonymes sont le cauchemar — c'est pour ça qu'on vérifie chaque lien manuellement au-dessus de ce seuil.\n\n→ ${SITE_URL}\n\n#OpenData #TransparencePolitique`,
  },
  {
    slug: "wikidata-source",
    content: `🔧 D'où viennent les condamnations sur Poligraph ?\n\nToutes les condamnations sont issues de Wikidata (propriété P1399), une base collaborative et sourcée. Chaque entrée est vérifiable et liée à des sources de presse.\n\n→ ${SITE_URL}\n\n#OpenData #TransparencePolitique`,
  },
  {
    slug: "votes-sync",
    content: `🔧 Comment sont récupérés les votes parlementaires ?\n\nChaque nuit, Poligraph synchronise les scrutins de l'Assemblée nationale et du Sénat via l'open data officiel. Plus de 10 000 votes analysés et croisés avec les groupes parlementaires.\n\n→ ${SITE_URL}/votes\n\n#OpenData #TransparencePolitique`,
  },
  {
    slug: "presumption-innocence",
    content: `🔧 Mis en examen ≠ coupable.\n\nSur Poligraph, chaque affaire affiche son statut judiciaire exact. Une mise en examen n'est pas une condamnation. La présomption d'innocence s'applique tant qu'il n'y a pas de jugement définitif.\n\n→ ${SITE_URL}\n\n#TransparencePolitique`,
  },
  {
    slug: "factcheck-sources",
    content: `🔧 Comment fonctionne le fact-checking sur Poligraph ?\n\nLes vérifications viennent de sources labellisées : AFP Factuel, Les Décodeurs, CheckNews, Politifact. Poligraph ne vérifie pas — il relie les déclarations aux verdicts des professionnels.\n\n→ ${SITE_URL}\n\n#FactCheck #TransparencePolitique`,
  },
  {
    slug: "open-data-an",
    content: `🔧 Les données de l'Assemblée sont en open data. Mais le format est... créatif.\n\nRelier un scrutin à son dossier législatif a nécessité du reverse-engineering sur les fichiers XML. 4 500 scrutins reliés à leur texte de loi sur 10 000.\n\n→ ${SITE_URL}/votes\n\n#OpenData #TransparencePolitique`,
  },
  {
    slug: "severity-levels",
    content: `🔧 Pourquoi distinguer atteinte à la probité et autres affaires ?\n\nUne condamnation pour corruption et une pour rébellion ne sont pas comparables. L'hémicycle de Poligraph distingue les atteintes à la probité (détournement, corruption, favoritisme) des autres infractions.\n\n→ ${SITE_URL}/statistiques\n\n#TransparencePolitique`,
  },
  {
    slug: "patrimoine",
    content: `🔧 Les déclarations de patrimoine sont publiques.\n\nLa Haute Autorité pour la Transparence (HATVP) publie le patrimoine des élus. Poligraph les structure pour permettre la comparaison. Immobilier, comptes, véhicules — tout est consultable.\n\n→ ${SITE_URL}\n\n#Transparence #HATVP`,
  },
] as const;

// --- Generators ---

async function divisiveVotes(recent: RecentlyPosted): Promise<TweetDraft[]> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const scrutins = await db.scrutin.findMany({
    where: { votingDate: { gte: thirtyDaysAgo } },
    orderBy: { votingDate: "desc" },
    take: 20,
    include: {
      votes: {
        include: {
          politician: {
            select: {
              mandates: {
                where: { isCurrent: true, parliamentaryData: { isNot: null } },
                take: 1,
                select: {
                  parliamentaryData: {
                    select: {
                      parliamentaryGroup: { select: { name: true, code: true } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  const drafts: TweetDraft[] = [];

  for (const s of scrutins) {
    const entityId = `votes:${s.slug || s.id}`;
    if (wasRecentlyPosted(recent, entityId)) continue;
    if (s.votes.length < 50) continue;

    // Aggregate votes by parliamentary group
    const groupVotes = new Map<
      string,
      { name: string; pour: number; contre: number; abstention: number; total: number }
    >();
    for (const v of s.votes) {
      if (v.position === "ABSENT" || v.position === "NON_VOTANT") continue;
      const group = v.politician.mandates[0]?.parliamentaryData?.parliamentaryGroup;
      const code = group?.code || "NI";
      const name = group?.name || "Non-inscrits";
      const entry = groupVotes.get(code) || {
        name,
        pour: 0,
        contre: 0,
        abstention: 0,
        total: 0,
      };
      if (v.position === "POUR") entry.pour++;
      else if (v.position === "CONTRE") entry.contre++;
      else if (v.position === "ABSTENTION") entry.abstention++;
      entry.total++;
      groupVotes.set(code, entry);
    }

    // Find the group most in favor and the group most against
    let topPourGroup = { name: "", pct: 0 };
    let topContreGroup = { name: "", pct: 0 };

    for (const [, counts] of groupVotes) {
      if (counts.total < 10) continue;
      const pourPct = counts.pour / counts.total;
      const contrePct = counts.contre / counts.total;
      if (pourPct > topPourGroup.pct) {
        topPourGroup = { name: counts.name, pct: pourPct };
      }
      if (contrePct > topContreGroup.pct) {
        topContreGroup = { name: counts.name, pct: contrePct };
      }
    }

    // Check divisiveness: the overall split should be meaningful
    const total = s.votesFor + s.votesAgainst + s.votesAbstain;
    if (total === 0) continue;
    const pourPct = Math.round((s.votesFor / total) * 100);
    const contrePct = Math.round((s.votesAgainst / total) * 100);
    const minSide = Math.min(pourPct, 100 - pourPct);
    if (minSide < 20) continue; // Not divisive enough

    let content = `🗳️ L'Assemblée s'est divisée sur « ${s.title} ».\n\n`;
    content += `Pour : ${pourPct}% | Contre : ${contrePct}%`;

    if (topPourGroup.name && topContreGroup.name && topPourGroup.name !== topContreGroup.name) {
      content += `\n${topPourGroup.name} : ${Math.round(topPourGroup.pct * 100)}% pour · ${topContreGroup.name} : ${Math.round(topContreGroup.pct * 100)}% contre`;
    }

    const link = `${SITE_URL}/parlement/votes/${s.slug || s.id}`;
    content += `\n\n→ ${link}`;

    drafts.push({ content, link, entityId });

    if (drafts.length >= 2) break;
  }

  return drafts;
}

async function keyStats(recent: RecentlyPosted): Promise<TweetDraft[]> {
  // Rotate between 4 angles — pick first not recently posted
  const angles = [
    "condamnations-par-parti",
    "participation-groupes",
    "elus-par-parti",
    "patrimoine",
  ];

  for (const angle of angles) {
    const entityId = `chiffres:${angle}`;
    if (wasRecentlyPosted(recent, entityId)) continue;

    const draft = await generateStatsAngle(angle, entityId);
    if (draft) return [draft];
  }

  return [];
}

async function generateStatsAngle(angle: string, entityId: string): Promise<TweetDraft | null> {
  switch (angle) {
    case "condamnations-par-parti": {
      const condamnationCounts = await db.affair.groupBy({
        by: ["politicianId"],
        where: {
          publicationStatus: "PUBLISHED",
          involvement: "DIRECT",
          status: {
            in: [
              "CONDAMNATION_DEFINITIVE",
              "CONDAMNATION_PREMIERE_INSTANCE",
              "APPEL_EN_COURS",
              "POURVOI_EN_CASSATION",
            ],
          },
        },
        _count: true,
      });

      const politicianCondamnations = new Map(
        condamnationCounts.map((a) => [a.politicianId, a._count])
      );

      const politiciansWithParty = await db.politician.findMany({
        where: {
          publicationStatus: "PUBLISHED",
          currentPartyId: { not: null },
        },
        select: { id: true, currentParty: { select: { shortName: true } } },
      });

      const partyMap = new Map<string, { count: number; members: number }>();
      for (const p of politiciansWithParty) {
        const party = p.currentParty!.shortName;
        const entry = partyMap.get(party) || { count: 0, members: 0 };
        entry.count += politicianCondamnations.get(p.id) || 0;
        entry.members++;
        partyMap.set(party, entry);
      }

      const sorted = [...partyMap.entries()]
        .filter(([, v]) => v.count > 0)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 6);

      if (sorted.length === 0) return null;

      const totalCondamnations = sorted.reduce((sum, [, v]) => sum + v.count, 0);

      let content = `📊 ${totalCondamnations} condamnations d'élus par parti :\n\n`;
      for (const [party, { count, members }] of sorted) {
        content += `• ${party} : ${count}/${members} ${plural(members, "élu")}\n`;
      }
      content += `\nImplication directe, 1ère instance ou définitive.`;

      const link = `${SITE_URL}/affaires`;
      content += `\n\n→ ${link}`;

      return { content, link, entityId };
    }

    case "participation-groupes": {
      return null;
    }

    case "elus-par-parti": {
      const parties = await db.party.findMany({
        where: {
          politicians: { some: { publicationStatus: "PUBLISHED" } },
        },
        select: {
          shortName: true,
          _count: {
            select: {
              politicians: { where: { publicationStatus: "PUBLISHED" } },
            },
          },
        },
        orderBy: { politicians: { _count: "desc" } },
        take: 8,
      });

      if (parties.length === 0) return null;

      const totalPoliticians = parties.reduce((sum, p) => sum + p._count.politicians, 0);

      let content = `📊 ${totalPoliticians} élus suivis sur Poligraph.\n\n`;
      for (const p of parties.slice(0, 6)) {
        content += `• ${p.shortName} — ${p._count.politicians}\n`;
      }
      content += `\nVotes, mandats, affaires, patrimoine — mêmes critères pour tous.`;

      const link = `${SITE_URL}/statistiques`;
      content += `\n\n→ ${link}`;

      return { content, link, entityId };
    }

    case "patrimoine": {
      const withDeclarations = await db.politician.count({
        where: {
          publicationStatus: "PUBLISHED",
          declarations: { some: {} },
        },
      });

      if (withDeclarations === 0) return null;

      let content = `📊 ${withDeclarations} élus avec déclaration de patrimoine publiée sur Poligraph.\n\n`;
      content += `Immobilier, comptes, véhicules — données HATVP structurées et comparables.`;

      const link = `${SITE_URL}/statistiques`;
      content += `\n\n→ ${link}`;

      return { content, link, entityId };
    }

    default:
      return null;
  }
}

async function recentAffairs(recent: RecentlyPosted): Promise<TweetDraft[]> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const affairs = await db.affair.findMany({
    where: {
      publicationStatus: "PUBLISHED",
      involvement: "DIRECT",
      updatedAt: { gte: sevenDaysAgo },
    },
    include: {
      politician: {
        select: {
          fullName: true,
          slug: true,
          currentParty: { select: { shortName: true } },
          mandates: {
            where: { isCurrent: true },
            take: 1,
            select: { type: true },
          },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 10,
  });

  const drafts: TweetDraft[] = [];

  for (const a of affairs) {
    const entityId = `affaires:${a.slug}`;
    if (wasRecentlyPosted(recent, entityId)) continue;

    const statusLabel = AFFAIR_STATUS_LABELS[a.status].toLowerCase();
    const needsPresumption = AFFAIR_STATUS_NEEDS_PRESUMPTION[a.status];
    const party = a.politician.currentParty?.shortName || "";
    const mandate = a.politician.mandates[0];
    const mandateLabel = mandate ? MANDATE_TYPE_LABELS[mandate.type].toLowerCase() : "";
    const categoryLabel = AFFAIR_CATEGORY_LABELS[a.category]?.toLowerCase() || "";

    let content = `⚖️ ${a.politician.fullName}`;
    if (party) content += ` (${party})`;
    if (mandateLabel) content += `, ${mandateLabel}`;
    if (categoryLabel) content += ` — ${categoryLabel}`;
    content += `.\n\n`;
    content += `Statut : ${statusLabel}.`;

    if (a.sentence) {
      content += `\n« Peine : ${a.sentence} »`;
    }

    if (needsPresumption) {
      content += `\n⚠️ Présomption d'innocence.`;
    }

    const link = `${SITE_URL}/affaires/${a.slug}`;
    content += `\n\n→ ${link}`;

    drafts.push({ content, link, entityId });

    if (drafts.length >= 2) break;
  }

  return drafts;
}

async function factchecks(recent: RecentlyPosted): Promise<TweetDraft[]> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const recentFcs = await db.factCheck.findMany({
    where: {
      publishedAt: { gte: sevenDaysAgo },
      languageCode: "fr",
      source: { in: FACTCHECK_ALLOWED_SOURCES },
      mentions: {
        some: {
          politician: { publicationStatus: "PUBLISHED" },
        },
      },
    },
    include: {
      mentions: {
        where: { isClaimant: true },
        include: {
          politician: {
            select: {
              fullName: true,
              slug: true,
              currentParty: { select: { shortName: true } },
            },
          },
        },
        take: 1,
      },
    },
    orderBy: { publishedAt: "desc" },
    take: 10,
  });

  if (recentFcs.length === 0) return [];

  const drafts: TweetDraft[] = [];

  for (const fc of recentFcs) {
    const entityId = `factchecks:${fc.slug || fc.id}`;
    if (wasRecentlyPosted(recent, entityId)) continue;

    const politician = fc.mentions[0]?.politician;
    if (!politician) continue; // Must be linked to a tracked politician

    const verdictLabel = VERDICT_LABELS[fc.verdictRating] || fc.verdict;
    const claim = fc.claimText || fc.title;
    const claimantName = fc.claimant || politician.fullName;

    let content = `🔍 « ${claim} »\n— ${claimantName}`;

    content += `\n\nVerdict : ${verdictLabel.toUpperCase()}.`;
    if (fc.source) content += ` (${fc.source})`;

    const link = `${SITE_URL}/politiques/${politician.slug}`;
    content += `\n\n→ ${link}`;

    drafts.push({ content, link, entityId });

    if (drafts.length >= 1) break;
  }

  return drafts;
}

async function deputySpotlight(recent: RecentlyPosted): Promise<TweetDraft[]> {
  // Fetch a batch of prominent politicians with current mandates
  const candidates = await db.politician.findMany({
    where: {
      publicationStatus: "PUBLISHED",
      prominenceScore: { gte: 100 },
      mandates: { some: { isCurrent: true } },
    },
    include: {
      currentParty: { select: { shortName: true } },
      mandates: {
        where: { isCurrent: true },
        take: 1,
        select: { type: true, constituency: true },
      },
      _count: {
        select: {
          affairs: { where: { publicationStatus: "PUBLISHED", involvement: "DIRECT" } },
        },
      },
    },
    orderBy: { prominenceScore: "desc" },
    take: 50,
  });

  for (const politician of candidates) {
    const entityId = `politiques:${politician.slug}`;
    if (wasRecentlyPosted(recent, entityId)) continue;

    const mandate = politician.mandates[0];
    const mandateLabel = mandate ? MANDATE_TYPE_LABELS[mandate.type].toLowerCase() : "";
    const party = politician.currentParty?.shortName || "";

    // Build hook — skip this politician if no factual hook
    let hook = "";

    if (politician._count.affairs > 0) {
      const affairCount = politician._count.affairs;
      hook = `${affairCount} ${plural(affairCount, "affaire")} judiciaire${affairCount > 1 ? "s" : ""} documentée${affairCount > 1 ? "s" : ""}`;
    }

    // Skip if no hook
    if (!hook) continue;

    let content = `👤 ${politician.fullName}`;
    if (party) content += ` (${party})`;
    if (mandateLabel) content += `, ${mandateLabel}`;
    content += `.\n\n${hook}.`;

    const link = `${SITE_URL}/politiques/${politician.slug}`;
    content += `\n\n→ ${link}`;

    return [{ content, link, entityId }];
  }

  return [];
}

async function elections(recent: RecentlyPosted): Promise<TweetDraft[]> {
  const now = new Date();

  const upcoming = await db.election.findFirst({
    where: {
      status: { in: ["UPCOMING", "REGISTRATION", "CANDIDACIES", "CAMPAIGN"] },
      round1Date: { gte: now },
    },
    orderBy: { round1Date: "asc" },
    include: {
      _count: { select: { candidacies: true } },
    },
  });

  if (upcoming) {
    const entityId = `elections:${upcoming.slug}`;
    if (wasRecentlyPosted(recent, entityId)) return [];

    const days = daysUntil(upcoming.round1Date!);

    let content = `🗳️ J-${days} avant les ${upcoming.title}.\n\n`;
    if (upcoming._count.candidacies > 0) {
      content += `${upcoming._count.candidacies.toLocaleString("fr-FR")} candidatures enregistrées.`;
    }

    const link = `${SITE_URL}/elections/${upcoming.slug}`;
    content += `\n\n→ ${link}`;

    return [{ content, link, entityId }];
  }

  // Fallback: recent completed election
  const completed = await db.election.findFirst({
    where: { status: "COMPLETED" },
    orderBy: { round1Date: "desc" },
  });

  if (completed) {
    const entityId = `elections:${completed.slug}`;
    if (wasRecentlyPosted(recent, entityId)) return [];

    let content = `🗳️ ${completed.title}\n\n`;
    content += `Résultats, élus, candidats — tout est en ligne.`;

    const link = `${SITE_URL}/elections/${completed.slug}`;
    content += `\n\n→ ${link}`;

    return [{ content, link, entityId }];
  }

  return [];
}

async function participationRanking(recent: RecentlyPosted): Promise<TweetDraft[]> {
  void recent;
  return [];
}

async function methodoPost(recent: RecentlyPosted): Promise<TweetDraft[]> {
  for (const topic of METHODO_TOPICS) {
    const entityId = `methodo:${topic.slug}`;
    if (wasRecentlyPosted(recent, entityId)) continue;

    return [{ content: topic.content, entityId }];
  }

  return [];
}

// --- Exports ---

export const GENERATORS: Record<string, (recent: RecentlyPosted) => Promise<TweetDraft[]>> = {
  votes: divisiveVotes,
  chiffres: keyStats,
  affaires: recentAffairs,
  factchecks: factchecks,
  profil: deputySpotlight,
  elections: elections,
  presence: participationRanking,
  methodo: methodoPost,
};

/** Generate a single tweet draft for a given category. Returns null if the generator produces nothing. */
export async function generateForCategory(
  category: string,
  recent: RecentlyPosted
): Promise<TweetDraft | null> {
  const gen = GENERATORS[category];
  if (!gen) return null;
  try {
    const drafts = await gen(recent);
    return drafts[0] ?? null;
  } catch (err) {
    console.error(`[social] Generator "${category}" failed:`, err);
    return null;
  }
}
