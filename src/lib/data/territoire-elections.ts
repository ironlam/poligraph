import { getCommuneDossier } from "@/lib/data/territoires";
import { communeScrutins, type CommuneScrutin } from "@/lib/territoires/commune-elections";

/**
 * Scrutins of one commune for the dedicated page (#1052). Read from the commune dossier, which
 * is already cached and tagged `territoire:<code>`: no extra query, no tag of its own.
 */
export interface CommuneElections {
  commune: { inseeCode: string; name: string };
  /** Most recent first. Never empty: a commune without result has no such page. */
  scrutins: CommuneScrutin[];
  /** Same signals as the commune page, for the robots verdict. */
  indexSignals: { population: number | null; maireEtabli: boolean };
}

export async function getCommuneElections(code: string): Promise<CommuneElections | null> {
  const dossier = await getCommuneDossier(code);
  if (!dossier) return null;
  const scrutins = communeScrutins(dossier.elections, dossier.identity.inseeCode);
  if (scrutins.length === 0) return null;
  return {
    commune: { inseeCode: dossier.identity.inseeCode, name: dossier.identity.name },
    scrutins,
    indexSignals: {
      population: dossier.population.value,
      maireEtabli: dossier.maire.state === "ETABLI",
    },
  };
}
