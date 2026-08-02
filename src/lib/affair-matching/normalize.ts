/**
 * The single normalizer of the affair-matching module.
 *
 * It exists as its own file because two copies of it drifted and cost a real
 * recall failure: the prefilter turned hyphens into spaces, the name-quality
 * signal did not. The prefilter proposed « Mayer Rossignol » on a text spelling
 * it « Mayer-Rossignol », and name-quality then disqualified the candidate as
 * "surname not present in text". Nothing threw, nothing scored low, the
 * candidate simply vanished, and 1835 politicians carry a compound surname.
 *
 * Semantics match `src/lib/name-matching.ts::normalizeText`, the project-wide
 * normalizer used by the identity resolver, the candidature importer and the
 * mention blocklist. The affair-matching module keeps a local copy rather than
 * importing that one, which pulls in server-only dependencies signals must not
 * see, but the behaviour is deliberately identical.
 */
export function normalizeForMatching(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[‘’]/g, "'")
      .replace(/[-–—]/g, " ")
      // Any run of whitespace becomes one plain space. French typography puts a
      // non-breaking space before « : » and inside names, so a press text spells
      // « Le Pen » while the base holds « Le Pen ». The prefilter tokenizes with
      // \s and never noticed; this function compared the two literally and declared
      // the surname absent. One deliberate divergence from
      // `src/lib/name-matching.ts::normalizeText`, which does not collapse.
      .replace(/\s+/g, " ")
      .trim()
  );
}
