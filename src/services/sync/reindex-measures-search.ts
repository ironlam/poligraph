import { db } from "@/lib/db";
import { reindexMeasures } from "@/lib/search/maintenance";
import { PRESIDENTIELLE_2027_SLUG } from "@/lib/presidentielle/themes";

export type ReindexMeasuresSearchResult = {
  electionSlug: string;
  total: number;
  processed: number;
  batches: number;
  lastId: string | null;
};

/** Rebuild every measure search document for the bounded 2027 presidential corpus. */
export async function reindexPresidentialMeasureSearch(): Promise<ReindexMeasuresSearchResult> {
  const total = await db.measure.count({
    where: { election: { slug: PRESIDENTIELLE_2027_SLUG } },
  });
  const result = await reindexMeasures({
    electionSlug: PRESIDENTIELLE_2027_SLUG,
    batchSize: 100,
  });

  return {
    electionSlug: PRESIDENTIELLE_2027_SLUG,
    total,
    processed: result.processed,
    batches: result.batches,
    lastId: result.lastId,
  };
}
