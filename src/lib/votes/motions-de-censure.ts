/**
 * Rules of the motions de censure page, /parlement/motions-de-censure. Pure: the data layer feeds
 * them rows, the tests feed them literals.
 *
 * A motion de censure is adopted by the majority of the members composing the Assembly (article 49
 * of the Constitution), counted on the seats actually filled on the day: 289 with 577 deputies, 288
 * or 287 when seats are vacant. Only the votes for the motion are counted, so the AN records no
 * "contre" and no abstention on these scrutins.
 */

/** `Scrutin.codeTypeVote` of a motion de censure in the AN open data, both legislatures. */
export const MOTION_DE_CENSURE_CODE = "MOC";

export const CONSTITUTION_SOURCE_URL =
  "https://www.conseil-constitutionnel.fr/le-bloc-de-constitutionnalite/texte-integral-de-la-constitution-du-4-octobre-1958-en-vigueur";
export const AN_VOTES_OPEN_DATA_URL =
  "https://data.assemblee-nationale.fr/travaux-parlementaires/votes";

/**
 * Majority required on the day, from the members of each group counted by the AN for this scrutin
 * (`ScrutinOfficialGroupCount.memberCount`, deputies outside any group included as their own line).
 * Checked on 2026-11-28 against `nbrSuffragesRequis` of the AN open data: equal on all 57 motions of
 * the XVIe and XVIIe legislatures. `null` when the source gave no member count.
 */
export function requiredMajority(memberCounts: Array<number | null>): number | null {
  const seats = memberCounts.reduce<number>((sum, n) => sum + (n ?? 0), 0);
  return seats > 0 ? Math.floor(seats / 2) + 1 : null;
}

/**
 * 49-2: tabled on the deputies' initiative. 49-3: in answer to the government engaging its
 * responsibility on a text. Read from the official title; `null` if it names neither.
 */
export type CensureArticle = "49-2" | "49-3";

export function censureArticle(title: string): CensureArticle | null {
  const match = /article\s+49\s*,?\s*alin[ée]a\s+([23])\b/i.exec(title);
  if (!match) return null;
  return match[1] === "2" ? "49-2" : "49-3";
}

export const CENSURE_ARTICLE_LABELS: Record<CensureArticle, string> = {
  "49-2": "Article 49, alinéa 2",
  "49-3": "Article 49, alinéa 3",
};

export interface GovernmentPeriod {
  slug: string;
  name: string;
  /** Appointment of the Prime minister: a government is in office from that day. */
  appointedAt: Date;
}

/**
 * The government a motion targets: the last one whose Prime minister was appointed on or before the
 * vote. Periods overlap in the base (a government ends when the next team is named), so the latest
 * appointment wins rather than the first period that contains the date.
 */
export function governmentAt(date: Date, governments: GovernmentPeriod[]): GovernmentPeriod | null {
  let best: GovernmentPeriod | null = null;
  for (const gov of governments) {
    if (gov.appointedAt.getTime() > date.getTime()) continue;
    if (!best || gov.appointedAt.getTime() > best.appointedAt.getTime()) best = gov;
  }
  return best;
}
