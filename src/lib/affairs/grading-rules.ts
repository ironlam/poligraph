/**
 * Grading rules for the published-conviction audit (#566), and nothing else.
 *
 * This file exists so the version guard has a referent that cannot drift. The
 * alternative was hand-listing the rules inside the test, which is the exact
 * defect #583 reports: `AFFAIR_STATUSES` was hand-copied and diverged from the
 * Prisma enum. A hand-kept list of "what counts as a rule" would diverge the
 * same way, and the symptom would be worse — a baseline declared comparable
 * when the rules behind it had moved.
 *
 * Anything that decides a level or reads a ledger belongs in `audit-evidence.ts`.
 */
import { createHash } from "node:crypto";
import type { Involvement } from "@/generated/prisma";

export const RULES = {
  /**
   * Bump whenever any value below changes. `grading-rules.test.ts` fails until
   * the new version is given its fingerprint, which turns a silent rule change
   * into a CI failure.
   *
   * Starts at 1 rather than 3: three commits changed the rules after the
   * 2026-07-26 baseline was frozen (584ba9e7, b732ebc2, bcce13ce), but which
   * rules were in force that day cannot be reconstructed honestly. That baseline
   * therefore carries no version and is reported as incomparable.
   */
  version: 2,

  evidence: {
    /** Court and competent-institution hosts. Level B. */
    officialHosts: [
      "courdecassation.fr",
      "cours-appel.justice.fr",
      "justice.fr",
      "conseil-etat.fr",
      "ccomptes.fr",
      "legifrance.gouv.fr",
      "conseil-constitutionnel.fr",
      "juricaf.org",
    ],

    /** Publishers that are themselves a court or a competent institution. Level B. */
    officialPublisher:
      /cour d.appel|cour de cassation|conseil d.[ée]tat|cour des comptes|tribunal|parquet|minist[èe]re de la justice|conseil constitutionnel|ordre des/i,

    /**
     * Source types that never count as an independent secondary source.
     *
     * Wikipedia is excluded deliberately: it is the source that misled the fiches
     * on the 7 July 2026 ruling, and an encyclopedia attests no dispositif.
     */
    notIndependentTypes: ["WIKIPEDIA", "WIKIDATA"],
  },

  coherence: {
    /**
     * Roles for which the judicial outcome of the affair is the person's own.
     *
     * `satisfies` rather than a cast at the point of use: it checks every value
     * against the Prisma enum while keeping the literal types the fingerprint
     * needs. A cast would silence a typo here, and a typo here is not benign —
     * `includes()` would match no involvement at all, so every conviction in the
     * corpus would be reported as describing a third party's outcome.
     */
    adverseInvolvements: ["DIRECT", "INDIRECT"] satisfies readonly Involvement[],

    /**
     * A recourse still open, stated explicitly.
     *
     * The first version searched for "pourvoi", "en appel" or "non définitive"
     * anywhere and flagged 15 affairs wrongly: a final conviction normally
     * recounts its own history ("condamné en appel", "rejet du pourvoi, donnant
     * un caractère définitif"). Mentioning a past recourse is not a contradiction.
     */
    pendingRecourse: [
      /pourvoi[^.]{0,60}?(reste possible|est possible|en cours|pendant|a [ée]t[ée] form[ée])/i,
      /(se sont pourvus|s'est pourvu|se pourvoit)[^.]{0,40}cassation/i,
      /appel en cours/i,
      /n['’]est pas d[ée]finitive/i,
    ],

    /**
     * Recourses exhausted, stated explicitly. Cancels the pendency signal.
     *
     * The plain "la condamnation est définitive" was added after a false flag:
     * the pattern only recognised the adverb and "caractère définitif". The
     * negation "n'est pas définitive" cannot match, "n'est pas" sitting between
     * the two words sought.
     */
    recourseExhausted:
      /rejet[^.]{0,40}pourvoi|pourvoi[^.]{0,40}(rejet|a [ée]t[ée] rejet)|d[ée]finitivement|caract[èe]re d[ée]finitif|voies de recours [ée]puis|condamnation est (aujourd'hui )?d[ée]finitive|devenue d[ée]finitive|rendant la condamnation d[ée]finitive/i,

    /**
     * A term split between a firm part and a suspended part.
     *
     * Deliberately generic, naming no penalty: the corpus writes prison splits
     * without ever saying « prison ». Four of the fifteen known fiches would be
     * lost by requiring the word, among them « 1 an ferme (aménagé en bracelet
     * électronique) + 2 ans avec sursis » and « 4 ans ferme, 1 an avec sursis ».
     *
     * Attribution is asymmetric instead: see `prisonContext`. Kept close-range,
     * and segmented on `;` too, so an unrelated « dont » further down a description
     * does not fire.
     *
     * Lazy quantifiers, like `pendingRecourse` above: greedy ones swallowed the next
     * penalty whole, so « dont 1 an ferme et 45 mois d'inéligibilité dont 30 avec
     * sursis » produced a single match spanning both and only one of the two splits
     * was ever seen.
     */
    partlySuspended: [
      /\bdont\b[^.|;]{0,60}?(sursis|ferme)/i,
      /\bferme\b[^.|;]{0,60}?sursis/i,
      /\bsursis\b[^.|;]{0,60}?ferme/i,
    ],

    /**
     * Which penalty a split marker belongs to, decided by the nearest keyword
     * BEFORE it rather than by mere co-occurrence.
     *
     * Co-occurrence was tried first and misattributed five fiches: « 5 ans de
     * prison dont 3 ans ferme, 6 ans d'inéligibilité » is a single segment, since a
     * comma does not cut, and naming ineligibility later in it does not make the
     * split the ineligibility's.
     *
     * No keyword before the marker means prison, which is why the pattern above
     * names no penalty: « 1 an ferme (aménagé en bracelet électronique) + 2 ans
     * avec sursis » carries none, and four of the fifteen known fiches read that way.
     */
    prisonContext: /prison|emprisonnement|r[ée]clusion|d[ée]tention/gi,
    ineligibilityContext: /in[ée]ligibilit[ée]|droits civiques/gi,
  },

  /**
   * Semantics of the consumer, folded into the fingerprinted values on purpose.
   *
   * The predicate behind `partlySuspended` changed from `prisonSuspended === false`
   * to `prisonFirmMonths === prisonMonths` in v2. A guard watching only the patterns
   * would have let a delta across that change look comparable, which is the exact
   * failure this module exists to prevent (#576).
   */
  assessmentMode: {
    partlySuspended: "firm-equals-total-v2",
  },
} as const;

/**
 * Canonical form used for hashing: RegExp reduced to source + flags, object keys
 * sorted, so neither declaration order nor formatting shifts the fingerprint.
 */
function canonicalise(value: unknown): unknown {
  if (value instanceof RegExp) return { __re: value.source, __flags: value.flags };
  if (Array.isArray(value)) return value.map(canonicalise);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, nested]) => [key, canonicalise(nested)])
    );
  }
  return value;
}

/**
 * Fingerprint of a rule set, version excluded.
 *
 * Excluding `version` is what makes the guard meaningful: were the version
 * hashed, bumping it would change the fingerprint on its own and the test would
 * pass without anyone checking whether the rules actually moved.
 *
 * Exported separately from `rulesFingerprint` so the guard can be tested against
 * a deliberately altered rule set.
 */
export function fingerprintOf(rules: { version: number }): string {
  const { version: _ignored, ...values } = rules;

  return createHash("sha256")
    .update(JSON.stringify(canonicalise(values)))
    .digest("hex")
    .slice(0, 16);
}

export function rulesFingerprint(): string {
  return fingerprintOf(RULES);
}
