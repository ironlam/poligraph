/**
 * Whether a parliamentary sync may write the party it inferred from the group.
 *
 * The Assemblée and Sénat feeds publish a group, never a party. The group's `defaultPartyId` is
 * a guess that is wrong for every member who belongs elsewhere (L'Après in the Écologiste group,
 * Génération.s with the socialists). The careers sync reads the real party from Wikidata, and
 * overriding it every week closed and reopened the membership on each run: 1,300 rows between
 * February and August 2026, shown to readers as "Rejoint PS" four times in six weeks.
 *
 * So the group only fills a politician who has no party yet. It never replaces one, and a group
 * without a default party never clears one.
 */
export function shouldApplyGroupParty(
  currentPartyId: string | null,
  groupPartyId: string | null
): groupPartyId is string {
  return groupPartyId !== null && currentPartyId === null;
}
