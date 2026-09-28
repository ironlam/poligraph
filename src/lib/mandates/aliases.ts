/**
 * Les autres noms sous lesquels une personne est connue.
 *
 * Une fiche porte un seul nom, et les sources n'en donnent pas le même : nom de naissance
 * contre nom marital, forme régionale (« Peio » pour « Pierre », « Giovanni » pour « Jean »),
 * prénom d'usage contre prénom d'état civil. Le sync reconnaît ces cas et rattache le mandat à
 * la bonne personne, mais la fiche reste introuvable sous l'autre nom.
 *
 * Écraser le nom de la fiche avec celui de la source serait pire : les sources se contredisent,
 * le registre porte ses propres fautes de frappe, et le slug ne suivrait pas. On ajoute, on
 * n'écrase jamais.
 */

/** Casse, accents et ponctuation ne font pas un autre nom. */
function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z]+/g, " ")
    .trim();
}

/**
 * La nouvelle liste d'alias, ou `null` s'il n'y a rien à écrire.
 *
 * Rendre `null` plutôt qu'une liste identique laisse l'appelant sauter l'écriture : le sync
 * repasse sur 34 000 lignes à chaque run, et réécrire une colonne inchangée 34 000 fois est du
 * bruit en base comme dans les journaux.
 */
export function nextAliases(
  politician: { fullName: string; aliases: string[] },
  incomingFullName: string
): string[] | null {
  const incoming = incomingFullName.trim();
  if (incoming.length === 0) return null;

  const key = normalize(incoming);
  if (key.length === 0) return null;
  if (key === normalize(politician.fullName)) return null;
  if (politician.aliases.some((alias) => normalize(alias) === key)) return null;

  return [...politician.aliases, incoming];
}
