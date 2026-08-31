import { Prisma } from "@/generated/prisma";
import {
  PRESIDENTIAL_SEARCH_EMBEDDING_DIMENSIONS,
  PRESIDENTIAL_SEARCH_EMBEDDING_MODEL,
  PRESIDENTIAL_SEARCH_QUERY_TIMEOUT_MS,
  PRESIDENTIAL_SEARCH_SEMANTIC_MIN_SIMILARITY,
} from "@/config/presidential-search-embedding";
import { callMistralEmbeddings } from "@/lib/api/mistral";
import { db } from "@/lib/db";
import { searchPublicPage, type SearchHit, type SearchPublicPage } from "@/lib/search/query";
import { validateMistralEmbeddingBatch } from "@/services/presidentielle/search-embeddings";
import { getOrCreatePresidentialQueryEmbedding } from "@/services/presidentielle/query-embedding-cache";
import { reservePresidentialSemanticSearchBudget } from "@/services/presidentielle/semantic-search-budget";

const RRF_K = 60;

export type PresidentialSearchStrategy = "lexical" | "semantic" | "hybrid";

export type PresidentialSearchPage = SearchPublicPage & {
  strategy: "lexical" | "semantic" | "hybrid" | "lexical-fallback";
  semanticMaxSimilarity?: number | null;
};

type SemanticSearchHit = SearchHit & { similarity: number };

function key(hit: SearchHit): string {
  return `${hit.entityType}:${hit.entityId}`;
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .toLocaleLowerCase("fr")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Reciprocal-rank fusion combines two rankings without treating their incomparable scores as a
 * political or editorial score. An exact title remains first, then agreement between lexical and
 * semantic retrieval is rewarded. Stable lexical order breaks ties.
 */
export function fusePresidentialSearchHits(
  rawQuery: string,
  lexical: SearchHit[],
  semantic: SearchHit[],
  limit: number
): SearchHit[] {
  const query = normalize(rawQuery);
  const entries = new Map<
    string,
    { hit: SearchHit; score: number; lexicalRank: number; exactTitle: boolean }
  >();

  const add = (hit: SearchHit, rank: number, source: "lexical" | "semantic") => {
    const hitKey = key(hit);
    const current = entries.get(hitKey) ?? {
      hit,
      score: 0,
      lexicalRank: Number.POSITIVE_INFINITY,
      exactTitle: normalize(hit.title) === query,
    };
    current.score += 1 / (RRF_K + rank + 1);
    if (source === "lexical") current.lexicalRank = rank;
    entries.set(hitKey, current);
  };

  lexical.forEach((hit, rank) => add(hit, rank, "lexical"));
  semantic.forEach((hit, rank) => add(hit, rank, "semantic"));

  return [...entries.values()]
    .toSorted(
      (left, right) =>
        Number(right.exactTitle) - Number(left.exactTitle) ||
        right.score - left.score ||
        left.lexicalRank - right.lexicalRank ||
        left.hit.title.localeCompare(right.hit.title, "fr")
    )
    .slice(0, limit)
    .map(({ hit }) => hit);
}

async function searchSemantic(input: {
  electionId: string;
  query: string;
  limit: number;
}): Promise<SemanticSearchHit[]> {
  const vector = await getOrCreatePresidentialQueryEmbedding(input.query, async () => {
    const budget = await reservePresidentialSemanticSearchBudget();
    if (!budget.allowed) {
      throw new Error(`budget sémantique indisponible (${budget.reason})`);
    }
    const startedAt = performance.now();
    const response = await callMistralEmbeddings([input.query], {
      model: PRESIDENTIAL_SEARCH_EMBEDDING_MODEL,
      signal: AbortSignal.timeout(PRESIDENTIAL_SEARCH_QUERY_TIMEOUT_MS),
    });
    console.info("Recherche sémantique présidentielle", {
      provider: "Mistral",
      model: PRESIDENTIAL_SEARCH_EMBEDDING_MODEL,
      latencyMs: Math.round(performance.now() - startedAt),
      promptTokens: response.usage?.prompt_tokens ?? null,
      totalTokens: response.usage?.total_tokens ?? null,
    });
    return validateMistralEmbeddingBatch(response.data, 1)[0]!;
  });
  const vectorLiteral = `[${vector.join(",")}]`;

  return db.$queryRaw<SemanticSearchHit[]>(Prisma.sql`
    SELECT
      document."entityType",
      document."entityId",
      document.title,
      document.url,
      1 - (embedding.embedding <=> ${vectorLiteral}::extensions.vector) AS similarity
    FROM "SearchEmbedding" AS embedding
    INNER JOIN "SearchDocument" AS document
      ON document.id = embedding."searchDocumentId"
    WHERE document.visibility = 'PUBLIC'::"SearchVisibility"
      AND document."electionId" = ${input.electionId}
      AND embedding.model = ${PRESIDENTIAL_SEARCH_EMBEDDING_MODEL}
      AND embedding.dimensions = ${PRESIDENTIAL_SEARCH_EMBEDDING_DIMENSIONS}
      AND embedding."sourceUpdatedAt" = document."sourceUpdatedAt"
    ORDER BY embedding.embedding <=> ${vectorLiteral}::extensions.vector ASC, document.title ASC
    LIMIT ${input.limit}
  `);
}

export async function searchPresidentialPage(input: {
  electionId: string;
  query: string;
  lexicalQuery?: string;
  limit: number;
  strategy: PresidentialSearchStrategy;
}): Promise<PresidentialSearchPage> {
  if (input.strategy === "lexical") {
    return {
      ...(await searchPublicPage(input.lexicalQuery ?? input.query, {
        electionId: input.electionId,
        limit: input.limit,
      })),
      strategy: "lexical",
    };
  }

  if (input.strategy === "semantic") {
    const semanticHits = await searchSemantic(input);
    const semanticMaxSimilarity = semanticHits[0]?.similarity ?? null;
    const hits = semanticHits
      .filter((hit) => hit.similarity >= PRESIDENTIAL_SEARCH_SEMANTIC_MIN_SIMILARITY)
      .slice(0, input.limit);
    return {
      hits,
      total: hits.length,
      strategy: "semantic",
      semanticMaxSimilarity,
    };
  }

  const lexicalPromise = searchPublicPage(input.lexicalQuery ?? input.query, {
    electionId: input.electionId,
    limit: input.limit,
  });

  const [lexical, semanticResult] = await Promise.all([
    lexicalPromise,
    searchSemantic(input).then(
      (hits) => ({ ok: true as const, hits }),
      (error: unknown) => {
        console.warn(
          "Recherche sémantique présidentielle indisponible, repli lexical :",
          error instanceof Error ? error.message : error
        );
        return { ok: false as const, hits: [] };
      }
    ),
  ]);
  if (!semanticResult.ok) return { ...lexical, strategy: "lexical-fallback" };

  const semanticMaxSimilarity = semanticResult.hits[0]?.similarity ?? null;
  const semanticHits = semanticResult.hits.filter(
    (hit) => hit.similarity >= PRESIDENTIAL_SEARCH_SEMANTIC_MIN_SIMILARITY
  );

  const hits = fusePresidentialSearchHits(input.query, lexical.hits, semanticHits, input.limit);
  return {
    hits,
    total: Math.max(lexical.total, hits.length),
    strategy: "hybrid",
    semanticMaxSimilarity,
  };
}
