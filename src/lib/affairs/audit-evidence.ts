/**
 * Evidence grading for published convictions (#566).
 *
 * Pure logic, extracted from `scripts/audit-convictions.ts` so it can be unit
 * tested: the script calls `main()` at import time and connects to the
 * production database, so importing it from a test is not an option.
 *
 * The script keeps the file I/O and the console output; everything that decides
 * a level or reads a ledger lives here.
 */
import type { AffairStatus, Involvement } from "@/generated/prisma";
import { RULES } from "@/lib/affairs/grading-rules";

/**
 * The rules themselves live in `grading-rules.ts`, where they can be fingerprinted
 * as a whole. These are the names this module and the audit script already used;
 * they are now derived rather than declared, so they cannot drift from the
 * fingerprinted set.
 */
export const ADVERSE_INVOLVEMENTS = RULES.coherence.adverseInvolvements as readonly Involvement[];
export const OFFICIAL_HOSTS: readonly string[] = RULES.evidence.officialHosts;
export const OFFICIAL_PUBLISHER = RULES.evidence.officialPublisher;
export const NOT_INDEPENDENT_TYPES = new Set<string>(RULES.evidence.notIndependentTypes);
export const PENDING_RECOURSE: readonly RegExp[] = RULES.coherence.pendingRecourse;
export const RECOURSE_EXHAUSTED = RULES.coherence.recourseExhausted;

/** True when the text describes a sentence that is not entirely firm. */
export function describesPartlySuspendedSentence(text: string): boolean {
  return RULES.coherence.partlySuspended.some((re) => re.test(text));
}

export function describesPendingRecourse(description: string): boolean {
  if (RULES.coherence.recourseExhausted.test(description)) return false;
  return RULES.coherence.pendingRecourse.some((re) => re.test(description));
}

export type EvidenceLevel = "A" | "B" | "C" | "D";

/**
 * Why an affair left the queue.
 *
 * #566 allows two reasons to mark one examined: resolved, or transferred to an
 * issue that has an owner and a closure criterion. They do not mean the same
 * thing at all — the first asks nothing more, the second asks everything, just
 * elsewhere — and a flat array of ids could not tell them apart.
 */
export type ReviewOutcome =
  | { kind: "RESOLVED" }
  | { kind: "TRANSFERRED"; issue: number }
  /**
   * Marked examined under the string-array format, motive unrecorded. We know by
   * measurement that 10 of the 27 such entries are in fact transferred to #569
   * and #571, and that 17 are no longer contradictory hence probably resolved.
   * "Probably" is not data, so the unknown stays explicit.
   */
  | { kind: "LEGACY" };

export interface ReviewEntry {
  affairId: string;
  outcome: ReviewOutcome;
  /** Absent on legacy entries: the old format recorded no timestamp. */
  at?: string;
}

/**
 * Frozen point of comparison, valid only under the rules that produced it.
 *
 * `rulesVersion` is what the previous shape lacked. Without it the report
 * differenced measurements taken under different grading rules and printed
 * « D : 53 → 56 (+3) » on a corpus that had not changed by a single affair.
 */
export interface Baseline {
  rulesVersion: number;
  evidence: Record<EvidenceLevel, number>;
  contradictoryCount: number;
  /** Affaires sans ligne Source officielle. Complétude éditoriale. */
  withoutOfficialSource: number;
  /** Affaires sans aucune preuve officielle, décision rattachée incluse. */
  withoutOfficialEvidence: number;
  capturedAt: string;
}

export interface Ledger {
  /** Affaires sorties de la file, avec le motif de leur sortie. */
  reviewed: ReviewEntry[];
  baseline?: Baseline;
  /**
   * Untyped on purpose. This is an archive, not live data: nobody should read it
   * to decide anything, and giving it a type would invite exactly that. It holds
   * the pre-versioning baselines, one of which is the figure published on #566.
   */
  legacyBaselines?: unknown;
}

/**
 * A baseline can only be differenced against the rules it was captured under.
 *
 * Returning false is the honest answer, not a degraded one: « référence non
 * comparable » tells the reader something true, where a delta across a rule
 * change tells them something false.
 */
export function isComparable(baseline: Baseline | undefined, rulesVersion: number): boolean {
  return baseline?.rulesVersion === rulesVersion;
}

/**
 * Read a ledger of any generation.
 *
 * An older file carries `done: string[]` and a pair of unversioned baselines.
 * Those ids become `LEGACY` entries and the baselines are archived rather than
 * promoted: they were measured under rules that cannot be identified, so
 * treating them as a comparison point would reproduce the defect being fixed.
 */
export function parseLedger(raw: unknown): Ledger {
  const source = (raw ?? {}) as Record<string, unknown>;

  if (Array.isArray(source.reviewed)) {
    return {
      reviewed: source.reviewed as ReviewEntry[],
      baseline: source.baseline as Baseline | undefined,
      legacyBaselines: source.legacyBaselines,
    };
  }

  const done = Array.isArray(source.done) ? (source.done as string[]) : [];
  const unversioned =
    source.baseline || source.evidenceBaseline
      ? { baseline: source.baseline, evidenceBaseline: source.evidenceBaseline }
      : undefined;

  return {
    reviewed: done.map((affairId) => ({ affairId, outcome: { kind: "LEGACY" } })),
    baseline: undefined,
    legacyBaselines: source.legacyBaselines ?? unversioned,
  };
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

/** Titre réduit à sa substance, pour repérer une même dépêche reprise ailleurs. */
export function normaliseTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .sort()
    .join(" ");
}

export interface SourceRow {
  url: string;
  title: string;
  publisher: string;
  publishedAt: Date;
  sourceType: string;
}

/**
 * Stable identifiers for the coherence checks.
 *
 * The closure criteria of #566, #569, #571 and #580 used to quote the French
 * display strings word for word, so rewording a message broke a criterion. Issues
 * cite the kind; the message is free to change.
 */
export type ContradictionKind =
  | "IMPLICATION_NON_ADVERSE"
  | "VERDICT_SANS_DATE"
  | "VERDICT_DANS_LE_FUTUR"
  | "SOURCES_ANTERIEURES_AU_VERDICT"
  | "PEINE_FERME_MAIS_PARTIELLEMENT_SURSIS"
  | "DEFINITIF_MAIS_RECOURS_PENDANT"
  | "NON_DEFINITIF_MAIS_RECOURS_EPUISE";

export interface Contradiction {
  kind: ContradictionKind;
  /** Phrase affichée, en français. */
  message: string;
}

export interface Assessment {
  /**
   * Evidence axis, on its own. A property of the world: the documents exist or
   * they do not, and their absence can be permanent.
   *
   * A contradiction no longer collapses this. It used to: `if (contradictions
   * .length > 0) level = "D"` short-circuited the whole cascade, so a fiche backed
   * by an identified ruling whose `involvement` was wrong fell to D exactly like a
   * single-source fiche. 11 published fiches were in that state and the breakdown
   * had to be re-derived by hand to see it.
   */
  evidenceLevel: EvidenceLevel;
  /**
   * Coherence axis. A property of our own data entry, therefore always ours to
   * fix. Empty means the fiche does not contradict itself.
   */
  contradictions: Contradiction[];
  /**
   * An official `Source` row is attached. Measures editorial completeness of
   * the visible sourcing: what a reader can click on the page.
   */
  hasOfficialSource: boolean;
  /**
   * Something official backs the affair, whether a `Source` row or a linked
   * `CourtDecision`. The two are not the same thing, and conflating them was
   * understating the corpus: a level A affair holds an identified decision but
   * may carry no official Source row, so it counted as "unsourced".
   */
  hasOfficialEvidence: boolean;
  independentCount: number;
  /** Sources écartées du compte parce qu'elles reprennent le même titre. */
  duplicateReprints: number;
}

export function assess(affair: {
  status: AffairStatus;
  involvement: Involvement;
  verdictDate: Date | null;
  description: string | null;
  prisonMonths: number | null;
  prisonSuspended?: boolean | null;
  sentence?: string | null;
  otherSentence?: string | null;
  fineAmount: unknown;
  ineligibilityMonths: number | null;
  sources: SourceRow[];
  decisionCount: number;
}): Assessment {
  const hasOfficialSource = affair.sources.some(
    (s) =>
      s.sourceType === "JUDILIBRE" ||
      s.sourceType === "LEGIFRANCE" ||
      OFFICIAL_PUBLISHER.test(s.publisher) ||
      OFFICIAL_HOSTS.some((h) => hostOf(s.url) === h || hostOf(s.url).endsWith("." + h))
  );

  // Indépendance : éditeurs distincts, hors encyclopédies, et une seule fois par
  // titre normalisé (une dépêche reprise ne vaut pas deux attestations).
  const seenPublishers = new Set<string>();
  const seenTitles = new Set<string>();
  let independentCount = 0;
  let duplicateReprints = 0;
  for (const s of affair.sources) {
    if (NOT_INDEPENDENT_TYPES.has(s.sourceType)) continue;
    const publisher = s.publisher.trim().toLowerCase();
    const title = normaliseTitle(s.title);
    if (seenPublishers.has(publisher)) continue;
    if (title && seenTitles.has(title)) {
      duplicateReprints++;
      continue;
    }
    seenPublishers.add(publisher);
    if (title) seenTitles.add(title);
    independentCount++;
  }

  const contradictions: Contradiction[] = [];
  const flag = (kind: ContradictionKind, message: string) => contradictions.push({ kind, message });

  if (!ADVERSE_INVOLVEMENTS.includes(affair.involvement)) {
    flag(
      "IMPLICATION_NON_ADVERSE",
      `statut de condamnation avec implication ${affair.involvement}`
    );
  }
  if (!affair.verdictDate) {
    flag("VERDICT_SANS_DATE", "statut de condamnation sans date de verdict");
  } else if (affair.verdictDate.getTime() > Date.now()) {
    flag("VERDICT_DANS_LE_FUTUR", "date de verdict dans le futur");
  } else {
    // Encyclopedias are excluded here for the same reason they are excluded from
    // the independence count: they attest nothing about a dispositif. Leaving
    // them in defeated the check outright, since a Wikidata row is stamped with
    // its import date and therefore always postdates the verdict. Jalkh carried
    // a 2024 verdict whose only press source was written in 2020, and nothing
    // fired.
    const latest = affair.sources
      .filter((s) => !NOT_INDEPENDENT_TYPES.has(s.sourceType))
      .reduce<number>((max, s) => Math.max(max, s.publishedAt.getTime()), 0);
    if (latest > 0 && latest < affair.verdictDate.getTime()) {
      flag("SOURCES_ANTERIEURES_AU_VERDICT", "toutes les sources précèdent la date du verdict");
    }
  }

  // A total shown as entirely firm while the fiche's own text splits it.
  if (
    affair.prisonMonths != null &&
    affair.prisonMonths > 0 &&
    affair.prisonSuspended === false &&
    describesPartlySuspendedSentence(
      [affair.otherSentence, affair.sentence, affair.description].filter(Boolean).join(" | ")
    )
  ) {
    flag(
      "PEINE_FERME_MAIS_PARTIELLEMENT_SURSIS",
      "peine affichée entièrement ferme alors que le texte décrit une part avec sursis"
    );
  }

  const description = affair.description ?? "";
  if (affair.status === "CONDAMNATION_DEFINITIVE" && describesPendingRecourse(description)) {
    flag(
      "DEFINITIF_MAIS_RECOURS_PENDANT",
      "statut définitif mais la description décrit un recours pendant"
    );
  }
  if (affair.status !== "CONDAMNATION_DEFINITIVE" && RECOURSE_EXHAUSTED.test(description)) {
    flag(
      "NON_DEFINITIF_MAIS_RECOURS_EPUISE",
      "statut non définitif mais la description dit les voies de recours épuisées"
    );
  }

  // The cascade lost its first rung. A contradiction no longer decides the
  // evidence level, so a well-backed fiche that contradicts itself now reports
  // both facts instead of only the worse one.
  let evidenceLevel: EvidenceLevel;
  if (affair.decisionCount > 0) evidenceLevel = "A";
  else if (hasOfficialSource) evidenceLevel = "B";
  else if (independentCount >= 2) evidenceLevel = "C";
  else evidenceLevel = "D";

  return {
    evidenceLevel,
    contradictions,
    hasOfficialSource,
    hasOfficialEvidence: hasOfficialSource || affair.decisionCount > 0,
    independentCount,
    duplicateReprints,
  };
}

/** Peine chiffrée renseignée, donc vérifiable et à vérifier. */
export function hasPreciseSentence(a: {
  prisonMonths: number | null;
  fineAmount: unknown;
  ineligibilityMonths: number | null;
}): boolean {
  return Boolean(
    (a.prisonMonths ?? 0) > 0 ||
    (a.fineAmount != null && Number(a.fineAmount) > 0) ||
    (a.ineligibilityMonths ?? 0) > 0
  );
}
