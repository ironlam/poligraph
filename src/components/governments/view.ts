// Grouping of already-categorized functions for display. Presence is never decided here: the
// categories come from `compositionAt` / `filterMembers`; this only drops hidden people and
// groups what remains by person.

import type { GovernmentEpisode, PersonCard } from "@/lib/governments/mapping";
import type { Episode } from "@/lib/governments/types";

export type PersonGroup = { person: PersonCard; episodes: GovernmentEpisode[] };

/**
 * Visible people (published or pending) among the given functions, one group per person, in the
 * order of their first function. `byId` maps back to the enriched episodes.
 */
export function groupVisible(
  list: Episode[],
  byId: Map<string, GovernmentEpisode>,
  people: Record<string, PersonCard>
): PersonGroup[] {
  const groups = new Map<string, PersonGroup>();
  for (const { membershipId } of list) {
    const ep = byId.get(membershipId);
    if (!ep) continue;
    const person = people[ep.politicianId];
    if (!person || person.visibility === "hidden") continue;
    const group = groups.get(person.id);
    if (group) group.episodes.push(ep);
    else groups.set(person.id, { person, episodes: [ep] });
  }
  return [...groups.values()];
}
