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
 * Distribution captured on a first pass, the frozen point of comparison.
 *
 * `withoutOfficialSource` keeps its original name and its original meaning:
 * affairs carrying no official `Source` row. Renaming it would silently
 * reinterpret the figure already published on #566.
 */
export interface Baseline extends Record<EvidenceLevel, number> {
  withoutOfficialSource: number;
  capturedAt: string;
}

/**
 * Baseline for the stricter metric, added after `Baseline` and therefore
 * carrying its own capture date: a ledger written before this existed has no
 * historical figure to compare against, and inventing one would be a fiction.
 */
export interface EvidenceBaseline {
  withoutOfficialEvidence: number;
  capturedAt: string;
}

export interface Ledger {
  /** Identifiants d'affaires déjà examinées, dans l'ordre de traitement. */
  done: string[];
  /** Affaires sans ligne Source officielle, au premier passage. */
  baseline?: Baseline;
  /** Affaires sans aucune preuve officielle, à sa propre date de capture. */
  evidenceBaseline?: EvidenceBaseline;
}

/**
 * Read a ledger of any generation. An older file has no `evidenceBaseline`;
 * that absence is preserved rather than filled in, so the report can say the
 * metric has no history yet instead of pretending it was measured.
 */
export function parseLedger(raw: unknown): Ledger {
  const source = (raw ?? {}) as Partial<Ledger>;
  return {
    done: Array.isArray(source.done) ? source.done : [],
    baseline: source.baseline,
    evidenceBaseline: source.evidenceBaseline,
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

export interface Assessment {
  level: EvidenceLevel;
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
  contradictions: string[];
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

  const contradictions: string[] = [];
  if (!ADVERSE_INVOLVEMENTS.includes(affair.involvement)) {
    contradictions.push(`statut de condamnation avec implication ${affair.involvement}`);
  }
  if (!affair.verdictDate) {
    contradictions.push("statut de condamnation sans date de verdict");
  } else if (affair.verdictDate.getTime() > Date.now()) {
    contradictions.push("date de verdict dans le futur");
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
      contradictions.push("toutes les sources précèdent la date du verdict");
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
    contradictions.push(
      "peine affichée entièrement ferme alors que le texte décrit une part avec sursis"
    );
  }

  const description = affair.description ?? "";
  if (affair.status === "CONDAMNATION_DEFINITIVE" && describesPendingRecourse(description)) {
    contradictions.push("statut définitif mais la description décrit un recours pendant");
  }
  if (affair.status !== "CONDAMNATION_DEFINITIVE" && RECOURSE_EXHAUSTED.test(description)) {
    contradictions.push(
      "statut non définitif mais la description dit les voies de recours épuisées"
    );
  }

  let level: EvidenceLevel;
  if (contradictions.length > 0) level = "D";
  else if (affair.decisionCount > 0) level = "A";
  else if (hasOfficialSource) level = "B";
  else if (independentCount >= 2) level = "C";
  else level = "D";

  return {
    level,
    hasOfficialSource,
    hasOfficialEvidence: hasOfficialSource || affair.decisionCount > 0,
    independentCount,
    duplicateReprints,
    contradictions,
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
