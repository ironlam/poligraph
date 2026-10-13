import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/lib/db";
import { MUNICIPALES_2014_FILES, MUNICIPALES_2020_FILES } from "@/config/municipales-sources";
import { getCommuneResults2014, getCommuneResults2020 } from "@/lib/data/elections";
import { getCommuneDossier } from "@/lib/data/territoires";
import {
  communeScrutins,
  historicalMunicipales,
  type CommuneScrutin,
  type HistoricalMunicipalesEntry,
} from "@/lib/territoires/commune-elections";

/**
 * Scrutins of one commune for the dedicated page (#1052). The dossier carries the municipales
 * 2026 and the presidential results; the earlier municipales come from the readers of their own
 * pages, which are unbounded by design (one commune, every list). Nothing here reads a party.
 */
export interface CommuneElections {
  commune: { inseeCode: string; name: string };
  /** Most recent first. Never empty: a commune without result has no such page. */
  scrutins: CommuneScrutin[];
  /** Same signals as the commune page, for the robots verdict. */
  indexSignals: { population: number | null; maireEtabli: boolean };
}

const HISTORICAL_SLUGS = { 2020: "municipales-2020", 2014: "municipales-2014" } as const;

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

async function readHistorique(inseeCode: string): Promise<CommuneScrutin[]> {
  const [elections, r2020, r2014] = await Promise.all([
    db.election.findMany({
      where: { slug: { in: Object.values(HISTORICAL_SLUGS) } },
      select: { slug: true, round1Date: true, round2Date: true },
    }),
    getCommuneResults2020(inseeCode),
    getCommuneResults2014(inseeCode),
  ]);
  const dates = (slug: string) => elections.find((e) => e.slug === slug);

  const out: CommuneScrutin[] = [];
  const entries2020: HistoricalMunicipalesEntry[] = (r2020?.lists ?? []).map((l) => ({
    label: l.listName,
    isNamedList: l.isNamedList,
    candidateName: l.candidateName,
    round1Pct: l.round1Pct,
    round2Pct: l.round2Pct,
    isElected: l.isElected,
  }));
  // The 2014 reader substitutes the candidate name for a missing list name: equal strings mean
  // there was no list.
  const entries2014: HistoricalMunicipalesEntry[] = (r2014?.lists ?? []).map((l) => ({
    label: l.listName,
    isNamedList: l.listName !== l.candidateName,
    candidateName: l.candidateName,
    round1Pct: l.round1Pct,
    round2Pct: l.round2Pct,
    isElected: l.isElected,
  }));

  // 2020 files are split at 1,000 inhabitants, the list-ballot threshold of that election. The
  // ballot itself says which side the commune was on: named lists mean the large file, individual
  // candidates the small one. Today's population would misplace a commune that crossed 1,000 since.
  const files2020: Record<1 | 2, string | null> =
    (r2020?.namedListCount ?? 0) > 0
      ? { 1: MUNICIPALES_2020_FILES.t1Large, 2: MUNICIPALES_2020_FILES.t2Large }
      : { 1: MUNICIPALES_2020_FILES.t1Small, 2: MUNICIPALES_2020_FILES.t2Small };
  const files2014: Record<1 | 2, string | null> = {
    1: MUNICIPALES_2014_FILES.t1,
    2: MUNICIPALES_2014_FILES.t2,
  };

  for (const [year, entries, sources, electedUrl] of [
    [2020, entries2020, files2020, MUNICIPALES_2020_FILES.elus],
    [2014, entries2014, files2014, null],
  ] as const) {
    const slug = HISTORICAL_SLUGS[year];
    const e = dates(slug);
    const scrutin = historicalMunicipales({
      inseeCode,
      slug,
      year,
      round1Date: iso(e?.round1Date),
      round2Date: iso(e?.round2Date),
      sources,
      electedUrl,
      entries,
    });
    if (scrutin) out.push(scrutin);
  }
  return out;
}

export async function getCommuneElections(code: string): Promise<CommuneElections | null> {
  "use cache";
  // Same tags as the dossier it serializes (maire, 2026 ballot), plus the history readers'.
  cacheTag(
    "territoires",
    "politicians",
    "elections",
    "elections-municipales-2026",
    `territoire:${code}`
  );
  cacheLife("synced");

  const dossier = await getCommuneDossier(code);
  if (!dossier) return null;
  const historique = await readHistorique(dossier.identity.inseeCode);
  const scrutins = communeScrutins(dossier.elections, dossier.identity.inseeCode, historique);
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
