/**
 * The filter above the list of people elected, one card per constituency.
 *
 * A reader types a name ("ariege", "corse du sud") or a number ("1", "01", "2a"). A single
 * digit also matches its zero-padded code, and a number matches as a prefix so the list
 * narrows while the reader keeps typing ("9" then "97" then "973").
 */

/** Not a department number: the technical code of the French living abroad. */
const CODE_WITHOUT_NUMBER = "ZZ";

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function matchesConstituency(
  query: string,
  constituency: { code: string; name: string }
): boolean {
  const q = normalize(query);
  if (!q) return true;

  if (normalize(constituency.name).includes(q)) return true;

  if (constituency.code === CODE_WITHOUT_NUMBER) return false;
  const code = constituency.code.toLowerCase();
  return code.startsWith(q) || code === q.padStart(2, "0");
}
