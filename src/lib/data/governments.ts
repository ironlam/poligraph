import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/lib/db";
import {
  countParticipants,
  EPISODE_SELECT,
  GOVERNMENT_SELECT,
  toEpisode,
  toPersonCard,
  toPublishedGovernment,
  type GovernmentEpisode,
  type GovernmentRow,
  type PersonCard,
  type PublishedGovernment,
} from "@/lib/governments/mapping";

export type { GovernmentEpisode, PersonCard, PublishedGovernment };

export type GovernmentEpisodesData = {
  episodes: GovernmentEpisode[];
  people: Record<string, PersonCard>;
};

// Le cache est découpé par gouvernement : un seul jeu pour les 48 gouvernements de la Ve
// République dépasserait 2 Mo sérialisé. Chaque entrée reste à quelques dizaines de Kio.

const MAX_CONCURRENT_READS = 4;

/** Reads each government's entry, at most four at a time (pool connections, remote cache). */
async function episodesByGovernment(ids: string[]): Promise<GovernmentEpisodesData[]> {
  const out: GovernmentEpisodesData[] = new Array(ids.length);
  let next = 0;
  const worker = async () => {
    while (next < ids.length) {
      const i = next++;
      out[i] = await getGovernmentEpisodesFor(ids[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENT_READS, ids.length) }, worker));
  return out;
}

/** Lignes des gouvernements publiés, ordre chronologique. Une requête, sans les fonctions. */
async function getPublishedGovernmentRows(): Promise<GovernmentRow[]> {
  "use cache";
  cacheTag("gouvernements");
  cacheLife("synced");

  return db.government.findMany({
    where: { publicationStatus: "PUBLISHED" },
    select: GOVERNMENT_SELECT,
    orderBy: { sequence: "asc" },
  });
}

/**
 * Gouvernements publiés, dans l'ordre chronologique, avec leurs compteurs de personnes calculés
 * sur les fonctions déjà en cache par gouvernement (pas de relecture des biographies).
 */
export async function getPublishedGovernments(): Promise<PublishedGovernment[]> {
  "use cache";
  cacheTag("gouvernements");
  cacheLife("synced");

  const rows = await getPublishedGovernmentRows();
  const parts = await episodesByGovernment(rows.map((row) => row.id));
  return rows.map((row, i) => toPublishedGovernment(row, countParticipants(parts[i]!).get(row.id)));
}

/**
 * Fonctions d'un seul gouvernement publié, avec les personnes concernées (cachées comprises : la
 * règle 4 doit voir toutes les sorties d'un jour). Vide si le gouvernement n'est pas publié.
 * Une seule requête ; ordre : début du mandat puis identifiant.
 */
export async function getGovernmentEpisodesFor(
  governmentId: string
): Promise<GovernmentEpisodesData> {
  "use cache";
  cacheTag("gouvernements");
  cacheLife("synced");

  const rows = await db.mandateGovernment.findMany({
    where: { governmentId, government: { publicationStatus: "PUBLISHED" } },
    select: EPISODE_SELECT,
    orderBy: [{ mandate: { startDate: "asc" } }, { id: "asc" }],
  });

  const episodes: GovernmentEpisode[] = [];
  const people: Record<string, PersonCard> = {};
  for (const row of rows) {
    const episode = toEpisode(row);
    if (!episode) continue;
    episodes.push(episode);
    people[episode.politicianId] ??= toPersonCard(row.mandate.politician);
  }
  return { episodes, people };
}

/**
 * Toutes les fonctions des gouvernements publiés, assemblées depuis les entrées par gouvernement
 * (pas de frontière de cache ici). Ordre : jour de début, l'ordre de la requête étant conservé
 * à l'intérieur d'un gouvernement (tri stable). Aucun consommateur ne dépend de l'ordre entre
 * deux gouvernements : les règles de composition et les compteurs travaillent par gouvernement.
 */
export async function getGovernmentEpisodes(): Promise<GovernmentEpisodesData> {
  const rows = await getPublishedGovernmentRows();
  const parts = await episodesByGovernment(rows.map((row) => row.id));
  const episodes = parts
    .flatMap((part) => part.episodes)
    .sort((a, b) => a.start.localeCompare(b.start));
  const people: Record<string, PersonCard> = {};
  for (const part of parts) Object.assign(people, part.people);
  return { episodes, people };
}
