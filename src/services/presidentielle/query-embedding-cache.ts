import { createHash } from "node:crypto";
import { Redis } from "@upstash/redis";
import {
  PRESIDENTIAL_SEARCH_EMBEDDING_DIMENSIONS,
  PRESIDENTIAL_SEARCH_EMBEDDING_MODEL,
} from "@/config/presidential-search-embedding";
import { getUpstashCredentials } from "@/lib/ratelimit/upstash-credentials";

const CACHE_TTL_SECONDS = 24 * 60 * 60;
const MEMORY_CACHE_SIZE = 100;
const REDIS_TIMEOUT_MS = 250;

type QueryEmbeddingRedis = {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: number[], options: { ex: number }): Promise<unknown>;
};

function normalizeQuery(value: string): string {
  return value.normalize("NFC").toLocaleLowerCase("fr").trim().replace(/\s+/g, " ");
}

export function presidentialQueryEmbeddingCacheKey(query: string): string {
  const digest = createHash("sha256")
    .update(`${PRESIDENTIAL_SEARCH_EMBEDDING_MODEL}\0${normalizeQuery(query)}`)
    .digest("hex");
  return `search:presidentielle:query-embedding:${digest}`;
}

function isValidVector(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length === PRESIDENTIAL_SEARCH_EMBEDDING_DIMENSIONS &&
    value.every((item) => typeof item === "number" && Number.isFinite(item))
  );
}

async function withRedisTimeout<T>(operation: Promise<T>): Promise<T> {
  return Promise.race([
    operation,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("délai Redis dépassé")), REDIS_TIMEOUT_MS)
    ),
  ]);
}

export class PresidentialQueryEmbeddingCache {
  private readonly memory = new Map<string, number[]>();
  private readonly inFlight = new Map<string, Promise<number[]>>();

  constructor(private readonly redis: QueryEmbeddingRedis | null) {}

  async getOrCreate(query: string, create: () => Promise<number[]>): Promise<number[]> {
    const key = presidentialQueryEmbeddingCacheKey(query);
    const memoryHit = this.memory.get(key);
    if (memoryHit) return memoryHit;
    const running = this.inFlight.get(key);
    if (running) return running;

    const operation = this.loadOrCreate(key, create).finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, operation);
    return operation;
  }

  private async loadOrCreate(key: string, create: () => Promise<number[]>): Promise<number[]> {
    if (this.redis) {
      try {
        const cached = await withRedisTimeout(this.redis.get<unknown>(key));
        if (isValidVector(cached)) {
          this.remember(key, cached);
          return cached;
        }
      } catch (error) {
        console.warn(
          "Cache d'embedding de recherche indisponible :",
          error instanceof Error ? error.message : error
        );
      }
    }

    const vector = await create();
    if (!isValidVector(vector)) throw new Error("Embedding de requête présidentielle invalide");
    this.remember(key, vector);
    if (this.redis) {
      try {
        await withRedisTimeout(this.redis.set(key, vector, { ex: CACHE_TTL_SECONDS }));
      } catch (error) {
        console.warn(
          "Écriture du cache d'embedding de recherche impossible :",
          error instanceof Error ? error.message : error
        );
      }
    }
    return vector;
  }

  private remember(key: string, vector: number[]): void {
    this.memory.delete(key);
    this.memory.set(key, vector);
    if (this.memory.size > MEMORY_CACHE_SIZE) {
      const oldest = this.memory.keys().next().value as string | undefined;
      if (oldest) this.memory.delete(oldest);
    }
  }
}

function buildRedis(): QueryEmbeddingRedis | null {
  const credentials = getUpstashCredentials();
  return credentials ? new Redis(credentials) : null;
}

const queryEmbeddingCache = new PresidentialQueryEmbeddingCache(buildRedis());

export function getOrCreatePresidentialQueryEmbedding(
  query: string,
  create: () => Promise<number[]>
): Promise<number[]> {
  return queryEmbeddingCache.getOrCreate(query, create);
}
