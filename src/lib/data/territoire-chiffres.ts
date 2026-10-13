import { cacheLife, cacheTag } from "next/cache";
import { readPopulationSeries, type PopulationSeriesPoint } from "@/lib/data/commune-population";
import { getTerritoireReperes, type RepereRow } from "@/lib/data/territoire-reperes";
import { normalizeInseeCode } from "@/lib/data/territoires";
import {
  populationEvolution,
  type PopulationEvolution,
} from "@/lib/territoires/population-evolution";

/**
 * Everything the "Le territoire en chiffres" block of a commune needs, and nothing about its
 * elected officials: population series, their evolution, and the published figures of the lots.
 */
export interface CommuneChiffres {
  inseeCode: string;
  /** Latest vintage in force, null when the commune has none. */
  population: PopulationSeriesPoint | null;
  evolution: PopulationEvolution;
  reperes: RepereRow[];
}

export async function getCommuneChiffres(code: string): Promise<CommuneChiffres | null> {
  const inseeCode = normalizeInseeCode(code);
  if (!inseeCode) return null;
  return readCommuneChiffres(inseeCode);
}

async function readCommuneChiffres(inseeCode: string): Promise<CommuneChiffres> {
  "use cache";
  cacheTag("territoires", `territoire:${inseeCode}`);
  cacheLife("synced");

  const [series, reperes] = await Promise.all([
    readPopulationSeries(inseeCode),
    getTerritoireReperes("COM", inseeCode),
  ]);
  return {
    inseeCode,
    population: series[0] ?? null,
    evolution: populationEvolution(series),
    reperes,
  };
}
