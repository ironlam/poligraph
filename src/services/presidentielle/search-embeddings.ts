import { createHash, randomUUID } from "node:crypto";
import { Prisma, type SearchEntityType } from "@/generated/prisma";
import {
  PRESIDENTIAL_SEARCH_EMBEDDING_BATCH_SIZE,
  PRESIDENTIAL_SEARCH_EMBEDDING_DIMENSIONS,
  PRESIDENTIAL_SEARCH_EMBEDDING_MAX_CHARACTERS,
  PRESIDENTIAL_SEARCH_EMBEDDING_MODEL,
  PRESIDENTIAL_SEARCH_EMBEDDING_VERSION,
} from "@/config/presidential-search-embedding";
import { callMistralEmbeddings } from "@/lib/api/mistral";
import { db } from "@/lib/db";

type EmbeddableEntityType = Extract<SearchEntityType, "MEASURE" | "CANDIDACY">;

type SearchEmbeddingSourceRow = {
  id: string;
  title: string;
  body: string;
  sourceUpdatedAt: Date;
  embeddingModel: string | null;
  embeddingDimensions: number | null;
  embeddingContentHash: string | null;
  embeddingSourceUpdatedAt: Date | null;
};

export type PreparedSearchEmbedding = {
  searchDocumentId: string;
  content: string;
  contentHash: string;
  sourceUpdatedAt: Date;
};

export type SearchEmbeddingProgress = {
  entityType: EmbeddableEntityType;
  scanned: number;
  embedded: number;
  skippedFresh: number;
  batches: number;
  lastId: string | null;
  dryRun: boolean;
};

export type SearchEmbeddingOptions = {
  electionSlug: string;
  entityType: EmbeddableEntityType;
  after?: string;
  limit?: number;
  batchSize?: number;
  staleOnly?: boolean;
  dryRun?: boolean;
  onBatch?: (progress: SearchEmbeddingProgress) => void;
};

export function buildSearchEmbeddingContent(title: string, body: string): string {
  const normalize = (value: string) =>
    value
      .replace(/[\n\r\t]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const normalizedTitle = normalize(title);
  const normalizedBody = normalize(body);
  // A measure's title is the beginning of its published formulation and a candidacy body starts
  // with the candidate's name. Avoid spending the 500-character budget on the same words twice.
  const content = normalizedBody.startsWith(normalizedTitle)
    ? normalizedBody
    : `${normalizedTitle} ${normalizedBody}`.trim();
  return content.slice(0, PRESIDENTIAL_SEARCH_EMBEDDING_MAX_CHARACTERS).trim();
}

export function hashSearchEmbeddingContent(content: string): string {
  return createHash("sha256")
    .update(`${PRESIDENTIAL_SEARCH_EMBEDDING_VERSION}\0${content}`)
    .digest("hex");
}

function prepare(row: SearchEmbeddingSourceRow): PreparedSearchEmbedding {
  const content = buildSearchEmbeddingContent(row.title, row.body);
  return {
    searchDocumentId: row.id,
    content,
    contentHash: hashSearchEmbeddingContent(content),
    sourceUpdatedAt: row.sourceUpdatedAt,
  };
}

function isFresh(row: SearchEmbeddingSourceRow, prepared: PreparedSearchEmbedding): boolean {
  return (
    row.embeddingModel === PRESIDENTIAL_SEARCH_EMBEDDING_MODEL &&
    row.embeddingDimensions === PRESIDENTIAL_SEARCH_EMBEDDING_DIMENSIONS &&
    row.embeddingContentHash === prepared.contentHash &&
    row.embeddingSourceUpdatedAt?.getTime() === prepared.sourceUpdatedAt.getTime()
  );
}

export function validateMistralEmbeddingBatch(
  data: Array<{ index: number; embedding: number[] }>,
  expectedCount: number
): number[][] {
  if (data.length !== expectedCount) {
    throw new Error(`Mistral a renvoyé ${data.length} vecteur(s) pour ${expectedCount} entrée(s)`);
  }
  const ordered = data.toSorted((left, right) => left.index - right.index);
  return ordered.map((item, index) => {
    if (item.index !== index)
      throw new Error("Mistral a renvoyé des index de vecteurs incohérents");
    if (
      item.embedding.length !== PRESIDENTIAL_SEARCH_EMBEDDING_DIMENSIONS ||
      item.embedding.some((value) => !Number.isFinite(value))
    ) {
      throw new Error(
        `Le vecteur Mistral doit contenir ${PRESIDENTIAL_SEARCH_EMBEDDING_DIMENSIONS} nombres finis`
      );
    }
    return item.embedding;
  });
}

async function sourcePage(input: {
  electionId: string;
  entityType: EmbeddableEntityType;
  after?: string;
  take: number;
}): Promise<SearchEmbeddingSourceRow[]> {
  const after = input.after ? Prisma.sql`AND document.id > ${input.after}` : Prisma.empty;
  return db.$queryRaw<SearchEmbeddingSourceRow[]>(Prisma.sql`
    SELECT
      document.id,
      document.title,
      document.body,
      document."sourceUpdatedAt",
      embedding.model AS "embeddingModel",
      embedding.dimensions AS "embeddingDimensions",
      embedding."contentHash" AS "embeddingContentHash",
      embedding."sourceUpdatedAt" AS "embeddingSourceUpdatedAt"
    FROM "SearchDocument" AS document
    LEFT JOIN "SearchEmbedding" AS embedding
      ON embedding."searchDocumentId" = document.id
    WHERE document.visibility = 'PUBLIC'::"SearchVisibility"
      AND document."electionId" = ${input.electionId}
      AND document."entityType" = ${input.entityType}::"SearchEntityType"
      ${after}
    ORDER BY document.id ASC
    LIMIT ${input.take}
  `);
}

async function persistBatch(
  prepared: PreparedSearchEmbedding[],
  vectors: number[][]
): Promise<void> {
  await db.$transaction(async (tx) => {
    for (let index = 0; index < prepared.length; index += 1) {
      const item = prepared[index]!;
      const vector = vectors[index]!;
      const vectorLiteral = `[${vector.join(",")}]`;
      await tx.$executeRaw`
        INSERT INTO "SearchEmbedding" (
          id,
          "searchDocumentId",
          model,
          dimensions,
          "contentHash",
          "sourceUpdatedAt",
          embedding,
          "embeddedAt",
          "createdAt",
          "updatedAt"
        ) VALUES (
          ${randomUUID()},
          ${item.searchDocumentId},
          ${PRESIDENTIAL_SEARCH_EMBEDDING_MODEL},
          ${PRESIDENTIAL_SEARCH_EMBEDDING_DIMENSIONS},
          ${item.contentHash},
          ${item.sourceUpdatedAt},
          ${vectorLiteral}::extensions.vector,
          NOW(),
          NOW(),
          NOW()
        )
        ON CONFLICT ("searchDocumentId") DO UPDATE SET
          model = EXCLUDED.model,
          dimensions = EXCLUDED.dimensions,
          "contentHash" = EXCLUDED."contentHash",
          "sourceUpdatedAt" = EXCLUDED."sourceUpdatedAt",
          embedding = EXCLUDED.embedding,
          "embeddedAt" = NOW(),
          "updatedAt" = NOW()
      `;
    }
  });
}

async function embedPreparedBatch(prepared: PreparedSearchEmbedding[]): Promise<void> {
  for (
    let offset = 0;
    offset < prepared.length;
    offset += PRESIDENTIAL_SEARCH_EMBEDDING_BATCH_SIZE
  ) {
    const chunk = prepared.slice(offset, offset + PRESIDENTIAL_SEARCH_EMBEDDING_BATCH_SIZE);
    const response = await callMistralEmbeddings(
      chunk.map((item) => item.content),
      { model: PRESIDENTIAL_SEARCH_EMBEDDING_MODEL }
    );
    const vectors = validateMistralEmbeddingBatch(response.data, chunk.length);
    await persistBatch(chunk, vectors);
  }
}

export async function embedPresidentialSearchDocuments(
  options: SearchEmbeddingOptions
): Promise<SearchEmbeddingProgress> {
  const election = await db.election.findUnique({
    where: { slug: options.electionSlug },
    select: { id: true },
  });
  if (!election) throw new Error(`Élection introuvable : ${options.electionSlug}`);

  const limit = Math.min(Math.max(Math.trunc(options.limit ?? 500), 1), 5000);
  const batchSize = Math.min(Math.max(Math.trunc(options.batchSize ?? 100), 1), 500);
  const staleOnly = options.staleOnly ?? true;
  const dryRun = options.dryRun ?? false;
  let cursor = options.after;
  let scanned = 0;
  let embedded = 0;
  let skippedFresh = 0;
  let batches = 0;

  while (scanned < limit) {
    const rows = await sourcePage({
      electionId: election.id,
      entityType: options.entityType,
      ...(cursor ? { after: cursor } : {}),
      take: Math.min(batchSize, limit - scanned),
    });
    if (rows.length === 0) break;

    const candidates = rows.map((row) => ({ row, prepared: prepare(row) }));
    const stale = candidates.filter(({ row, prepared }) => !staleOnly || !isFresh(row, prepared));
    skippedFresh += candidates.length - stale.length;
    if (!dryRun && stale.length > 0) {
      await embedPreparedBatch(stale.map(({ prepared }) => prepared));
    }

    scanned += rows.length;
    embedded += stale.length;
    batches += 1;
    cursor = rows.at(-1)!.id;
    options.onBatch?.({
      entityType: options.entityType,
      scanned,
      embedded,
      skippedFresh,
      batches,
      lastId: cursor,
      dryRun,
    });
  }

  return {
    entityType: options.entityType,
    scanned,
    embedded,
    skippedFresh,
    batches,
    lastId: cursor ?? null,
    dryRun,
  };
}
