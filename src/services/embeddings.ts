/**
 * Embedding Service for RAG (Retrieval-Augmented Generation)
 *
 * Uses Voyage AI for generating embeddings (free tier: 200M tokens/month).
 * Stores embeddings in PostgreSQL as JSON arrays.
 * For MVP, similarity search is done in JavaScript.
 * Can be upgraded to pgvector for better performance.
 */

import { VoyageAIClient } from "voyageai";
import { db } from "@/lib/db";
import type { EmbeddingType, Prisma } from "@/generated/prisma";
import { getConvictionOnlyWhere, getPublishedAffairWhere } from "@/lib/affairs/public-filters";
import { INVOLVEMENT_LABELS } from "@/config/labels";
import {
  getPublicFactCheckWhere,
  PUBLIC_PARTY_WHERE,
  PUBLIC_POLITICIAN_WHERE,
} from "@/lib/api/public-contract";

// An affair is public only when it is published AND its politician is public.
const PUBLIC_AFFAIR_WHERE: Prisma.AffairWhereInput = {
  ...getPublishedAffairWhere(),
  politician: PUBLIC_POLITICIAN_WHERE,
};

// The global statistics document is stored as a PARTY embedding.
const GLOBAL_STATS_ID = "global-stats";

// Types whose embeddings must not outlive their source: gated types lose theirs when
// unpublished, press articles when deleted (they have no publication status).
const SWEPT_TYPES = ["AFFAIR", "POLITICIAN", "FACTCHECK", "PARTY", "PRESS_ARTICLE"] as const;

// Candidates checked against the database per search, as a multiple of `limit`.
const PUBLIC_CHECK_WINDOW = 4;

async function removeEmbedding(entityType: EmbeddingType, entityId: string): Promise<void> {
  await db.chatEmbedding.deleteMany({ where: { entityType, entityId } });
}

/** Delete embeddings of `entityType` whose entity is not in `publicIds`. */
async function removeStaleEmbeddings(
  entityType: EmbeddingType,
  publicIds: string[]
): Promise<void> {
  const keep = new Set(publicIds);
  if (entityType === "PARTY") keep.add(GLOBAL_STATS_ID);

  const existing = await db.chatEmbedding.findMany({
    where: { entityType },
    select: { entityId: true },
  });
  const stale = existing.map((e) => e.entityId).filter((id) => !keep.has(id));

  // Chunked to stay far below the bind-parameter limit.
  for (let i = 0; i < stale.length; i += 1000) {
    await db.chatEmbedding.deleteMany({
      where: { entityType, entityId: { in: stale.slice(i, i + 1000) } },
    });
  }
  if (stale.length > 0) {
    console.log(`Removed ${stale.length} stale ${entityType} embedding(s)`);
  }
}

// Voyage AI voyage-4-lite: shared embedding space, Matryoshka dimensions
// Other options: voyage-4 (1024 dims), voyage-4-large (best quality)
const EMBEDDING_MODEL = "voyage-4-lite";
const EMBEDDING_DIMENSIONS = 512;
const RERANK_MODEL = "rerank-2.5-lite";

// Initialize Voyage AI client
function getVoyageClient(): VoyageAIClient {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) {
    throw new Error("VOYAGE_API_KEY environment variable is not set");
  }
  return new VoyageAIClient({ apiKey });
}

/**
 * Generate embedding vector for a text
 */
export async function generateEmbedding(
  text: string,
  inputType: "document" | "query" = "document"
): Promise<number[]> {
  const client = getVoyageClient();

  const response = await client.embed({
    input: text.slice(0, 16000), // Voyage supports up to 32k tokens
    model: EMBEDDING_MODEL,
    inputType,
    outputDimension: EMBEDDING_DIMENSIONS,
  });

  if (!response.data || response.data.length === 0) {
    throw new Error("No embedding returned from Voyage AI");
  }

  return response.data[0]!.embedding as number[];
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Index a document (create or update embedding)
 */
export async function indexDocument(params: {
  entityType: EmbeddingType;
  entityId: string;
  content: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const { entityType, entityId, content, metadata } = params;

  if (!content.trim()) {
    console.warn(`Empty content for ${entityType}:${entityId}, skipping`);
    return;
  }

  const embedding = await generateEmbedding(content);

  await db.chatEmbedding.upsert({
    where: {
      entityType_entityId: { entityType, entityId },
    },
    create: {
      entityType,
      entityId,
      content,
      embedding: embedding as unknown as Prisma.InputJsonValue,
      metadata: (metadata as Prisma.InputJsonValue) ?? null,
    },
    update: {
      content,
      embedding: embedding as unknown as Prisma.InputJsonValue,
      metadata: (metadata as Prisma.InputJsonValue) ?? null,
      updatedAt: new Date(),
    },
  });
}

/**
 * Search result with similarity score
 */
export interface SearchResult {
  entityType: EmbeddingType;
  entityId: string;
  content: string;
  metadata: Record<string, unknown> | null;
  similarity: number;
}

/**
 * Search for similar documents by query
 */
export async function searchSimilar(params: {
  query: string;
  limit?: number;
  threshold?: number;
  entityTypes?: EmbeddingType[];
}): Promise<SearchResult[]> {
  const { query, limit = 5, threshold = 0.7, entityTypes } = params;

  // Generate query embedding (use "query" input type for better retrieval)
  const queryEmbedding = await generateEmbedding(query, "query");

  // Build where clause
  const where: Prisma.ChatEmbeddingWhereInput = {};
  if (entityTypes && entityTypes.length > 0) {
    where.entityType = { in: entityTypes };
  }

  // Fetch all embeddings (for MVP - can be optimized with pgvector later)
  const embeddings = await db.chatEmbedding.findMany({
    where,
    select: {
      entityType: true,
      entityId: true,
      content: true,
      embedding: true,
      metadata: true,
    },
  });

  // Calculate similarities
  const results: SearchResult[] = embeddings
    .map((doc) => {
      const docEmbedding = doc.embedding as unknown as number[];
      const similarity = cosineSimilarity(queryEmbedding, docEmbedding);
      return {
        entityType: doc.entityType,
        entityId: doc.entityId,
        content: doc.content,
        metadata: doc.metadata as Record<string, unknown> | null,
        similarity,
      };
    })
    .filter((r) => r.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity);

  const candidates = results.slice(0, limit * PUBLIC_CHECK_WINDOW);
  return (await keepPublicResults(candidates)).slice(0, limit);
}

/**
 * Drop results whose source entity is no longer public. Embeddings outlive a
 * status change (unpublish, rejection, deletion), so the gate is applied at
 * query time, not only at indexing time.
 */
async function keepPublicResults(results: SearchResult[]): Promise<SearchResult[]> {
  const idsOf = (type: EmbeddingType) =>
    results.filter((r) => r.entityType === type).map((r) => r.entityId);
  const affairIds = idsOf("AFFAIR");
  const politicianIds = idsOf("POLITICIAN");
  const factCheckIds = idsOf("FACTCHECK");
  const partyIds = idsOf("PARTY").filter((id) => id !== GLOBAL_STATS_ID);

  const [affairs, politicians, factChecks, parties] = await Promise.all([
    affairIds.length > 0
      ? db.affair.findMany({
          where: { id: { in: affairIds }, ...PUBLIC_AFFAIR_WHERE },
          select: { id: true, involvement: true, status: true },
        })
      : [],
    politicianIds.length > 0
      ? db.politician.findMany({
          where: { id: { in: politicianIds }, ...PUBLIC_POLITICIAN_WHERE },
          select: { id: true },
        })
      : [],
    factCheckIds.length > 0
      ? db.factCheck.findMany({
          where: { id: { in: factCheckIds }, ...getPublicFactCheckWhere() },
          select: { id: true },
        })
      : [],
    partyIds.length > 0
      ? db.party.findMany({
          where: { id: { in: partyIds }, ...PUBLIC_PARTY_WHERE },
          select: { id: true },
        })
      : [],
  ]);

  // An AFFAIR embedding whose role or status no longer matches the affair was written
  // under the old facts (a witness indexed as accused, for instance). Its stored text
  // cannot be safely rewritten here, so it is dropped until the daily pass reindexes it.
  // Embeddings from before `involvement` was stored have an unknown role: dropped too.
  const currentAffairs = affairs.filter((a) => {
    const metadata = results.find(
      (r) => r.entityType === "AFFAIR" && r.entityId === a.id
    )?.metadata;
    return (
      metadata?.involvement !== undefined &&
      metadata.involvement === a.involvement &&
      metadata.status === a.status
    );
  });

  const publicIds: Partial<Record<EmbeddingType, Set<string>>> = {
    AFFAIR: new Set(currentAffairs.map((a) => a.id)),
    POLITICIAN: new Set(politicians.map((p) => p.id)),
    FACTCHECK: new Set(factChecks.map((f) => f.id)),
    PARTY: new Set([GLOBAL_STATS_ID, ...parties.map((p) => p.id)]),
  };

  return results.filter((r) => publicIds[r.entityType]?.has(r.entityId) ?? true);
}

/**
 * Rerank search results using Voyage AI reranker for better relevance
 */
export async function rerankResults(
  query: string,
  results: SearchResult[],
  topK?: number
): Promise<SearchResult[]> {
  if (results.length <= 1) return results;

  const client = getVoyageClient();
  const documents = results.map((r) => r.content);

  const response = await client.rerank({
    query,
    documents,
    model: RERANK_MODEL,
    topK: topK ?? results.length,
  });

  if (!response.data || response.data.length === 0) {
    return results; // Fallback to original order
  }

  return response.data
    .filter((item) => item.index !== undefined)
    .map((item) => ({
      ...results[item.index!]!,
      similarity: item.relevanceScore ?? results[item.index!]!.similarity,
    }));
}

/**
 * Index a politician with their relevant information
 */
export async function indexPolitician(politicianId: string): Promise<void> {
  const politician = await db.politician.findFirst({
    where: { id: politicianId, ...PUBLIC_POLITICIAN_WHERE },
    include: {
      currentParty: true,
      mandates: {
        where: { isCurrent: true },
        take: 5,
      },
    },
  });

  if (!politician) {
    await removeEmbedding("POLITICIAN", politicianId);
    return;
  }

  // Build content for embedding
  const parts: string[] = [
    `${politician.civility || ""} ${politician.fullName}`,
    politician.currentParty ? `Parti: ${politician.currentParty.name}` : "Sans parti",
  ];

  // Add mandates
  for (const mandate of politician.mandates) {
    parts.push(`${mandate.title} (${mandate.institution})`);
  }

  // Add birth info
  if (politician.birthDate) {
    const age = Math.floor(
      (Date.now() - politician.birthDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
    );
    parts.push(`Né(e) en ${politician.birthDate.getFullYear()}, ${age} ans`);
  }

  // No affair count here: it would go stale when an affair is unpublished without
  // the politician being reindexed. AFFAIR embeddings carry that information.
  const content = parts.join(". ");

  await indexDocument({
    entityType: "POLITICIAN",
    entityId: politicianId,
    content,
    metadata: {
      name: politician.fullName,
      slug: politician.slug,
      party: politician.currentParty?.name,
      partyId: politician.currentPartyId,
    },
  });
}

/**
 * Index a legislative dossier
 */
export async function indexDossier(dossierId: string): Promise<void> {
  const dossier = await db.legislativeDossier.findUnique({
    where: { id: dossierId },
  });

  if (!dossier) return;

  const parts: string[] = [dossier.shortTitle || dossier.title];

  if (dossier.number) {
    parts.push(`Numéro: ${dossier.number}`);
  }

  if (dossier.category) {
    parts.push(`Catégorie: ${dossier.category}`);
  }

  if (dossier.summary) {
    parts.push(dossier.summary);
  }

  const content = parts.join(". ");

  await indexDocument({
    entityType: "DOSSIER",
    entityId: dossierId,
    content,
    metadata: {
      id: dossierId,
      slug: dossier.slug,
      title: dossier.shortTitle || dossier.title,
      number: dossier.number,
      status: dossier.status,
      category: dossier.category,
      sourceUrl: dossier.sourceUrl,
    },
  });
}

/**
 * Index a voting record (scrutin)
 */
export async function indexScrutin(scrutinId: string): Promise<void> {
  const scrutin = await db.scrutin.findUnique({
    where: { id: scrutinId },
  });

  if (!scrutin) return;

  const parts: string[] = [
    scrutin.title,
    `Date: ${scrutin.votingDate.toISOString().split("T")[0]}`,
    `Résultat: ${scrutin.result === "ADOPTED" ? "Adopté" : "Rejeté"}`,
    `Pour: ${scrutin.votesFor}, Contre: ${scrutin.votesAgainst}, Abstention: ${scrutin.votesAbstain}`,
  ];

  if (scrutin.description) {
    parts.push(scrutin.description);
  }

  if (scrutin.summary) {
    parts.push(scrutin.summary);
  }

  const content = parts.join(". ");

  await indexDocument({
    entityType: "SCRUTIN",
    entityId: scrutinId,
    content,
    metadata: {
      id: scrutinId,
      slug: scrutin.slug,
      title: scrutin.title,
      votingDate: scrutin.votingDate.toISOString(),
      result: scrutin.result,
      sourceUrl: scrutin.sourceUrl,
    },
  });
}

/**
 * Index an affair
 */
export async function indexAffair(affairId: string): Promise<void> {
  const affair = await db.affair.findFirst({
    where: { id: affairId, ...PUBLIC_AFFAIR_WHERE },
    include: {
      politician: { select: { fullName: true, slug: true } },
      partyAtTime: { select: { name: true } },
      sources: { take: 3 },
    },
  });

  if (!affair) {
    await removeEmbedding("AFFAIR", affairId);
    return;
  }

  const parts: string[] = [
    affair.title,
    `Concernant: ${affair.politician.fullName} (${INVOLVEMENT_LABELS[affair.involvement]})`,
    affair.description.slice(0, 500), // Truncate long descriptions
  ];

  if (affair.partyAtTime) {
    parts.push(`Parti à l'époque: ${affair.partyAtTime.name}`);
  }

  if (affair.verdictDate) {
    parts.push(`Verdict: ${affair.verdictDate.toISOString().split("T")[0]}`);
  }

  const content = parts.join(". ");

  await indexDocument({
    entityType: "AFFAIR",
    entityId: affairId,
    content,
    metadata: {
      title: affair.title,
      slug: affair.slug,
      politicianName: affair.politician.fullName,
      politicianSlug: affair.politician.slug,
      involvement: affair.involvement,
      status: affair.status,
      category: affair.category,
      sources: affair.sources.map((s) => ({ title: s.title, url: s.url })),
    },
  });
}

/**
 * Index a political party with detailed mandate statistics
 */
export async function indexParty(partyId: string): Promise<void> {
  const party = await db.party.findFirst({
    where: { id: partyId, ...PUBLIC_PARTY_WHERE },
    include: {
      _count: { select: { politicians: { where: PUBLIC_POLITICIAN_WHERE } } },
    },
  });

  if (!party) {
    await removeEmbedding("PARTY", partyId);
    return;
  }

  // Get mandate counts by type for this party
  const mandateCounts = await db.mandate.groupBy({
    by: ["type"],
    where: {
      isCurrent: true,
      politician: { currentPartyId: partyId, ...PUBLIC_POLITICIAN_WHERE },
    },
    _count: true,
  });

  const countByType: Record<string, number> = {};
  for (const m of mandateCounts) {
    countByType[m.type] = m._count;
  }

  const deputyCount = countByType["DEPUTE"] || 0;
  const senatorCount = countByType["SENATEUR"] || 0;
  const ministerCount =
    (countByType["MINISTRE"] || 0) +
    (countByType["MINISTRE_DELEGUE"] || 0) +
    (countByType["SECRETAIRE_ETAT"] || 0);
  const mepCount = countByType["DEPUTE_EUROPEEN"] || 0;

  const parts: string[] = [`${party.name} (${party.shortName})`];

  // Add detailed mandate counts
  const mandateParts: string[] = [];
  if (deputyCount > 0) mandateParts.push(`${deputyCount} député${deputyCount > 1 ? "s" : ""}`);
  if (senatorCount > 0) mandateParts.push(`${senatorCount} sénateur${senatorCount > 1 ? "s" : ""}`);
  if (ministerCount > 0)
    mandateParts.push(`${ministerCount} ministre${ministerCount > 1 ? "s" : ""}`);
  if (mepCount > 0) mandateParts.push(`${mepCount} eurodéputé${mepCount > 1 ? "s" : ""}`);

  if (mandateParts.length > 0) {
    parts.push(`Le ${party.shortName} a ${mandateParts.join(", ")}`);
    parts.push(`Combien de députés au ${party.shortName} ? ${deputyCount}`);
    parts.push(`Combien de sénateurs au ${party.shortName} ? ${senatorCount}`);
  } else {
    parts.push(`${party._count.politicians} membre(s)`);
  }

  if (party.description) {
    parts.push(party.description);
  }

  if (party.ideology) {
    parts.push(`Idéologie: ${party.ideology}`);
  }

  if (party.politicalPosition) {
    const positions: Record<string, string> = {
      FAR_LEFT: "Extrême gauche",
      LEFT: "Gauche",
      CENTER_LEFT: "Centre-gauche",
      CENTER: "Centre",
      CENTER_RIGHT: "Centre-droit",
      RIGHT: "Droite",
      FAR_RIGHT: "Extrême droite",
    };
    parts.push(`Position: ${positions[party.politicalPosition] || party.politicalPosition}`);
  }

  const content = parts.join(". ");

  await indexDocument({
    entityType: "PARTY",
    entityId: partyId,
    content,
    metadata: {
      name: party.name,
      shortName: party.shortName,
      slug: party.slug,
      color: party.color,
      memberCount: party._count.politicians,
      deputyCount,
      senatorCount,
      ministerCount,
      mepCount,
    },
  });
}

/**
 * Index a fact-check article
 */
export async function indexFactCheck(factCheckId: string): Promise<void> {
  const factCheck = await db.factCheck.findFirst({
    where: { id: factCheckId, ...getPublicFactCheckWhere() },
    include: {
      mentions: {
        where: { politician: PUBLIC_POLITICIAN_WHERE },
        include: { politician: { select: { fullName: true, slug: true } } },
      },
    },
  });

  if (!factCheck) {
    await removeEmbedding("FACTCHECK", factCheckId);
    return;
  }

  const verdictLabels: Record<string, string> = {
    TRUE: "Vrai",
    MOSTLY_TRUE: "Plutôt vrai",
    HALF_TRUE: "À moitié vrai",
    MISLEADING: "Trompeur",
    OUT_OF_CONTEXT: "Hors contexte",
    MOSTLY_FALSE: "Plutôt faux",
    FALSE: "Faux",
    UNVERIFIABLE: "Invérifiable",
  };

  const parts: string[] = [
    `Fact-check: ${factCheck.title}`,
    `Verdict: ${verdictLabels[factCheck.verdictRating] || factCheck.verdict}`,
    `Source: ${factCheck.source}`,
  ];

  if (factCheck.claimant) {
    parts.push(`Déclaration de: ${factCheck.claimant}`);
  }

  if (factCheck.claimText) {
    parts.push(`Déclaration vérifiée: ${factCheck.claimText.slice(0, 500)}`);
  }

  parts.push(`Publié le: ${factCheck.publishedAt.toISOString().split("T")[0]}`);

  if (factCheck.mentions.length > 0) {
    const names = factCheck.mentions.map((m) => m.politician.fullName);
    parts.push(`Politiciens mentionnés: ${names.join(", ")}`);
  }

  const content = parts.join(". ");

  await indexDocument({
    entityType: "FACTCHECK",
    entityId: factCheckId,
    content,
    metadata: {
      title: factCheck.title,
      verdict: verdictLabels[factCheck.verdictRating] || factCheck.verdict,
      verdictRating: factCheck.verdictRating,
      source: factCheck.source,
      sourceUrl: factCheck.sourceUrl,
      claimant: factCheck.claimant,
      publishedAt: factCheck.publishedAt.toISOString(),
      politicians: factCheck.mentions.map((m) => ({
        name: m.politician.fullName,
        slug: m.politician.slug,
      })),
    },
  });
}

/**
 * Index a press article
 */
export async function indexPressArticle(articleId: string): Promise<void> {
  const article = await db.pressArticle.findUnique({
    where: { id: articleId },
    include: {
      mentions: {
        where: { politician: PUBLIC_POLITICIAN_WHERE },
        include: { politician: { select: { fullName: true, slug: true } } },
      },
      partyMentions: {
        where: { party: PUBLIC_PARTY_WHERE },
        include: { party: { select: { name: true, shortName: true, slug: true } } },
      },
    },
  });

  if (!article) return;

  const parts: string[] = [
    article.title,
    `Source: ${article.feedSource}`,
    `Publié le: ${article.publishedAt.toISOString().split("T")[0]}`,
  ];

  // Prefer AI summary over raw description (better context for RAG)
  if (article.aiSummary) {
    parts.push(article.aiSummary);
  } else if (article.description) {
    parts.push(article.description.slice(0, 500));
  }

  if (article.mentions.length > 0) {
    const names = article.mentions.map((m) => m.politician.fullName);
    parts.push(`Politiciens mentionnés: ${names.join(", ")}`);
  }

  if (article.partyMentions.length > 0) {
    const partyNames = article.partyMentions.map((m) => m.party.shortName || m.party.name);
    parts.push(`Partis mentionnés: ${partyNames.join(", ")}`);
  }

  const content = parts.join(". ");

  await indexDocument({
    entityType: "PRESS_ARTICLE",
    entityId: articleId,
    content,
    metadata: {
      title: article.title,
      feedSource: article.feedSource,
      url: article.url,
      publishedAt: article.publishedAt.toISOString(),
      politicians: article.mentions.map((m) => ({
        name: m.politician.fullName,
        slug: m.politician.slug,
      })),
      parties: article.partyMentions.map((m) => ({
        name: m.party.name,
        shortName: m.party.shortName,
        slug: m.party.slug,
      })),
    },
  });
}

/**
 * Index global statistics (deputies, senators, parties, etc.)
 */
export async function indexGlobalStats(): Promise<void> {
  // Get mandate counts by type
  const mandateCounts = await db.mandate.groupBy({
    by: ["type"],
    where: { isCurrent: true, politician: PUBLIC_POLITICIAN_WHERE },
    _count: true,
  });

  const countByType: Record<string, number> = {};
  for (const m of mandateCounts) {
    countByType[m.type] = m._count;
  }

  const deputyCount = countByType["DEPUTE"] || 0;
  const senatorCount = countByType["SENATEUR"] || 0;
  const mepCount = countByType["DEPUTE_EUROPEEN"] || 0;
  const ministerCount =
    (countByType["MINISTRE"] || 0) +
    (countByType["MINISTRE_DELEGUE"] || 0) +
    (countByType["SECRETAIRE_ETAT"] || 0) +
    (countByType["PREMIER_MINISTRE"] || 0);

  // Get affair counts
  const affairCount = await db.affair.count({ where: PUBLIC_AFFAIR_WHERE });
  // Condamnations pénales définitives du mis en cause, jamais celles d'un tiers (témoin).
  const condemnedCount = await db.affair.count({
    where: {
      ...PUBLIC_AFFAIR_WHERE,
      ...getConvictionOnlyWhere(),
      status: "CONDAMNATION_DEFINITIVE",
    },
  });

  // Get party count
  const partyCount = await db.party.count({ where: PUBLIC_PARTY_WHERE });

  // Get dossier count
  const dossierCount = await db.legislativeDossier.count();

  // Get fact-check and press article counts
  const factCheckCount = await db.factCheck.count({ where: getPublicFactCheckWhere() });
  const pressArticleCount = await db.pressArticle.count();

  const content = `
STATISTIQUES OFFICIELLES DU PARLEMENT FRANÇAIS - Données globales et totaux.

DÉPUTÉS - ASSEMBLÉE NATIONALE:
- Combien y a-t-il de députés ? Il y a ${deputyCount} députés.
- Combien de députés en France ? ${deputyCount} députés à l'Assemblée nationale.
- Nombre total de députés : ${deputyCount}
- L'Assemblée nationale compte 577 sièges.

SÉNATEURS - SÉNAT:
- Combien y a-t-il de sénateurs ? Il y a ${senatorCount} sénateurs.
- Combien de sénateurs en France ? ${senatorCount} sénateurs au Sénat.
- Nombre total de sénateurs : ${senatorCount}
- Le Sénat compte 348 sièges.

GOUVERNEMENT:
- Combien de membres du gouvernement ? ${ministerCount} membres (ministres et secrétaires d'État).
- Combien de ministres ? ${ministerCount} au total.

PARLEMENT EUROPÉEN:
- Combien d'eurodéputés français ? ${mepCount} eurodéputés.
- La France dispose de 81 sièges au Parlement européen.

AUTRES STATISTIQUES:
- Partis politiques référencés : ${partyCount}
- Affaires judiciaires : ${affairCount} (dont ${condemnedCount} condamnations définitives)
- Dossiers législatifs : ${dossierCount}
- Fact-checks : ${factCheckCount} articles de vérification des faits
- Articles de presse : ${pressArticleCount} articles de la revue de presse
  `.trim();

  await indexDocument({
    entityType: "PARTY", // Using PARTY type for global stats
    entityId: GLOBAL_STATS_ID,
    content,
    metadata: {
      type: "global-stats",
      deputyCount,
      senatorCount,
      mepCount,
      ministerCount,
      partyCount,
      affairCount,
      condemnedCount,
      dossierCount,
      factCheckCount,
      pressArticleCount,
    },
  });

  console.log("Indexed global statistics");
}

/**
 * Batch index all entities of a type
 *
 * With `deltaOnly: true`, only entities that have been updated since their
 * last embedding will be re-indexed (based on updatedAt comparison).
 */
export async function indexAllOfType(
  entityType: EmbeddingType,
  options: {
    limit?: number;
    deltaOnly?: boolean;
    onProgress?: (current: number, total: number) => void;
  } = {}
): Promise<{ indexed: number; skipped: number; errors: number }> {
  const { limit, deltaOnly = false, onProgress } = options;
  let indexed = 0;
  let skipped = 0;
  let errors = 0;

  // Build a map of existing embedding updatedAt times for delta comparison
  let embeddingDates: Map<string, Date> | undefined;
  // AFFAIR embeddings written before `involvement` was stored: reindexed whatever their date.
  const missingInvolvement = new Set<string>();
  if (deltaOnly) {
    const existingEmbeddings = await db.chatEmbedding.findMany({
      where: { entityType },
      select: { entityId: true, updatedAt: true, metadata: entityType === "AFFAIR" },
    });
    embeddingDates = new Map(existingEmbeddings.map((e) => [e.entityId, e.updatedAt]));
    if (entityType === "AFFAIR") {
      for (const e of existingEmbeddings) {
        const metadata = e.metadata as Record<string, unknown> | null;
        if (metadata?.involvement === undefined) missingInvolvement.add(e.entityId);
      }
    }
  }

  // Helper: check if entity needs re-indexing
  const needsReindex = (entityId: string, entityUpdatedAt: Date): boolean => {
    if (!deltaOnly || !embeddingDates) return true;
    const embUpdated = embeddingDates.get(entityId);
    if (!embUpdated) return true; // No embedding yet
    if (missingInvolvement.has(entityId)) return true;
    return entityUpdatedAt > embUpdated;
  };

  // Helper: process a batch of entities
  async function processBatch<T extends { id: string; updatedAt: Date }>(
    entities: T[],
    indexFn: (id: string) => Promise<void>,
    typeName: string
  ) {
    // A full pass knows every indexable id, so it can drop embeddings of entities
    // that are gone or no longer public. A `limit` pass only sees a slice: skip it.
    if (limit === undefined && (SWEPT_TYPES as readonly string[]).includes(entityType)) {
      await removeStaleEmbeddings(
        entityType,
        entities.map((e) => e.id)
      );
    }

    for (let i = 0; i < entities.length; i++) {
      const entity = entities[i];
      if (!needsReindex(entity!.id, entity!.updatedAt)) {
        skipped++;
        onProgress?.(i + 1, entities.length);
        continue;
      }
      try {
        await indexFn(entity!.id);
        indexed++;
      } catch (e) {
        console.error(`Error indexing ${typeName} ${entity!.id}:`, e);
        errors++;
      }
      onProgress?.(i + 1, entities.length);
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  switch (entityType) {
    case "POLITICIAN": {
      const politicians = await db.politician.findMany({
        where: PUBLIC_POLITICIAN_WHERE,
        select: { id: true, updatedAt: true },
        take: limit,
      });
      await processBatch(politicians, indexPolitician, "politician");
      break;
    }
    case "DOSSIER": {
      const dossiers = await db.legislativeDossier.findMany({
        select: { id: true, updatedAt: true },
        take: limit,
      });
      await processBatch(dossiers, indexDossier, "dossier");
      break;
    }
    case "SCRUTIN": {
      const scrutins = await db.scrutin.findMany({
        select: { id: true, updatedAt: true },
        take: limit,
      });
      await processBatch(scrutins, indexScrutin, "scrutin");
      break;
    }
    case "AFFAIR": {
      const affairs = await db.affair.findMany({
        where: PUBLIC_AFFAIR_WHERE,
        select: { id: true, updatedAt: true },
        take: limit,
      });
      await processBatch(affairs, indexAffair, "affair");
      break;
    }
    case "PARTY": {
      const parties = await db.party.findMany({
        where: PUBLIC_PARTY_WHERE,
        select: { id: true, updatedAt: true },
        take: limit,
      });
      await processBatch(parties, indexParty, "party");
      break;
    }
    case "FACTCHECK": {
      const factChecks = await db.factCheck.findMany({
        where: getPublicFactCheckWhere(),
        select: { id: true, updatedAt: true },
        take: limit,
      });
      await processBatch(factChecks, indexFactCheck, "factcheck");
      break;
    }
    case "PRESS_ARTICLE": {
      const articles = await db.pressArticle.findMany({
        select: { id: true, createdAt: true },
        take: limit,
      });
      // PressArticle has no updatedAt — use createdAt (RSS articles are immutable)
      const mapped = articles.map((a) => ({ id: a.id, updatedAt: a.createdAt }));
      await processBatch(mapped, indexPressArticle, "press_article");
      break;
    }
  }

  return { indexed, skipped, errors };
}

/**
 * Get embedding stats
 */
export async function getEmbeddingStats(): Promise<Record<EmbeddingType, number>> {
  const results = await db.chatEmbedding.groupBy({
    by: ["entityType"],
    _count: true,
  });

  const stats: Record<string, number> = {
    POLITICIAN: 0,
    DOSSIER: 0,
    SCRUTIN: 0,
    AFFAIR: 0,
    PARTY: 0,
    FACTCHECK: 0,
    PRESS_ARTICLE: 0,
  };

  for (const r of results) {
    stats[r.entityType] = r._count;
  }

  return stats as Record<EmbeddingType, number>;
}
