import { describe, expect, it, vi } from "vitest";
import { PRESIDENTIAL_SEARCH_EMBEDDING_DIMENSIONS } from "@/config/presidential-search-embedding";
import {
  PresidentialQueryEmbeddingCache,
  presidentialQueryEmbeddingCacheKey,
} from "@/services/presidentielle/query-embedding-cache";

const vector = (value: number) =>
  Array(PRESIDENTIAL_SEARCH_EMBEDDING_DIMENSIONS).fill(value) as number[];

describe("cache des embeddings de requête présidentielle", () => {
  it("utilise un hash stable sans conserver la requête dans la clé", () => {
    const first = presidentialQueryEmbeddingCacheKey("  Déserts   médicaux ");
    const second = presidentialQueryEmbeddingCacheKey("déserts médicaux");
    expect(first).toBe(second);
    expect(first).not.toContain("déserts");
  });

  it("réutilise le cache partagé sans appeler le fournisseur", async () => {
    const redis = {
      get: vi.fn().mockResolvedValue(vector(0.2)),
      set: vi.fn(),
    };
    const cache = new PresidentialQueryEmbeddingCache(redis);
    const create = vi.fn();
    expect(await cache.getOrCreate("logement", create)).toEqual(vector(0.2));
    expect(create).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
  });

  it("mutualise deux requêtes concurrentes et écrit pendant vingt-quatre heures", async () => {
    const redis = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue("OK"),
    };
    const cache = new PresidentialQueryEmbeddingCache(redis);
    const create = vi.fn().mockResolvedValue(vector(0.3));
    const [first, second] = await Promise.all([
      cache.getOrCreate("retraites", create),
      cache.getOrCreate("retraites", create),
    ]);
    expect(first).toEqual(second);
    expect(create).toHaveBeenCalledTimes(1);
    expect(redis.set).toHaveBeenCalledWith(expect.any(String), vector(0.3), { ex: 86_400 });
  });

  it("continue sans Redis et refuse un vecteur mal dimensionné", async () => {
    const cache = new PresidentialQueryEmbeddingCache(null);
    await expect(cache.getOrCreate("école", async () => [0.1])).rejects.toThrow("invalide");
  });
});
