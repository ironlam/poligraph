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
  type PersonCard,
  type PublishedGovernment,
} from "@/lib/governments/mapping";

export type { GovernmentEpisode, PersonCard, PublishedGovernment };

/**
 * Gouvernements publiés, dans l'ordre chronologique. Une seule requête sur `Government` ; les
 * compteurs de personnes viennent de `getGovernmentEpisodes()` (cache imbriqué, même tag), pour
 * ne pas relire les fonctions ni les biographies.
 */
export async function getPublishedGovernments(): Promise<PublishedGovernment[]> {
  "use cache";
  cacheTag("gouvernements");
  cacheLife("synced");

  const [rows, episodesData] = await Promise.all([
    db.government.findMany({
      where: { publicationStatus: "PUBLISHED" },
      select: GOVERNMENT_SELECT,
      orderBy: { sequence: "asc" },
    }),
    getGovernmentEpisodes(),
  ]);
  const counts = countParticipants(episodesData);
  return rows.map((row) => toPublishedGovernment(row, counts.get(row.id)));
}

/**
 * Toutes les fonctions rattachées aux gouvernements publiés, avec les personnes concernées
 * (cachées comprises : la règle 4 doit voir toutes les sorties d'un jour). Un seul jeu en cache,
 * filtré en mémoire par les pages et les exports. Une seule requête.
 */
export async function getGovernmentEpisodes(): Promise<{
  episodes: GovernmentEpisode[];
  people: Record<string, PersonCard>;
}> {
  "use cache";
  cacheTag("gouvernements");
  cacheLife("synced");

  const rows = await db.mandateGovernment.findMany({
    where: { government: { publicationStatus: "PUBLISHED" } },
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
