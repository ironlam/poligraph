import { Judgement } from "@/generated/prisma";

import { IDENTITY_THRESHOLDS, scoreCandidate } from "@/lib/identity";
import type { CachedPolitician, ScoringInput } from "@/lib/identity";
import { sameCalendarDay } from "./rne-parse";

export interface HolderFacts {
  firstName: string | null;
  lastName: string | null;
  birthDate: Date | null;
}

export type HolderVerdict = "SAME" | "DIFFERENT" | "UNDECIDED";

/** Accent-free uppercase words, keeping boundaries: "D'harambure" becomes ["D", "HARAMBURE"]. */
function nameWords(value: string | null): string[] {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

/**
 * Whether two name parts agree, disagree, or cannot be told apart.
 *
 * Written for surnames, which must agree before anything else is scored, and reused on first
 * names to recognise a name of use against a birth name.
 *
 * `resolveBatch` looks candidates up by normalized last name first (resolver.ts) and only
 * then calls `scoreCandidate` to rank them, so the scorer assumes the last name already
 * agrees: the legacy combiner weighs birth date, department, first name and gender, and
 * nothing else. Calling the scorer directly would skip that gate, and two different people
 * sharing a first name and a birth date would come back SAME.
 *
 * Three tiers, because DIFFERENT is destructive here: it closes a mandate and creates
 * another. Only a clear agreement earns SAME, only a clear disagreement earns DIFFERENT, and
 * everything ambiguous stops the pipeline instead of rewriting it.
 *
 * 1. Same words, or the same letters once spacing is dropped. Covers the register's civil
 *    names against our usage names ("DE LA POEZE D'HARAMBURE" holds "D'HARAMBURE") and the
 *    particle written either way ("DE LA TOUR" and "DELATOUR" are one person).
 * 2. One is a substring of the other but neither of the above. "MARTIN" sits inside
 *    "MARTINEZ" without being the same name, so this is a question, not an answer.
 * 3. Nothing in common: a real succession.
 */
function nameVerdict(a: string | null, b: string | null): HolderVerdict {
  const left = nameWords(a);
  const right = nameWords(b);
  if (left.length === 0 || right.length === 0) return "UNDECIDED";

  const [shorter, longer] = left.length <= right.length ? [left, right] : [right, left];
  const words = new Set(longer);
  if (shorter.every((word) => words.has(word))) return "SAME";

  const leftGlued = left.join("");
  const rightGlued = right.join("");
  if (leftGlued === rightGlued) return "SAME";
  if (leftGlued.includes(rightGlued) || rightGlued.includes(leftGlued)) return "UNDECIDED";

  return "DIFFERENT";
}

/**
 * Whether an occupancy can be closed on this date without contradicting itself.
 *
 * The register lags. If it still names a predecessor whose term started before the mandate we
 * hold, closing that mandate would stamp an end date earlier than its own start, which is
 * corrupt data. Two sources disagreeing is a question for a human, not a write.
 */
export function isChronologicallyClosable(startDate: Date, endDate: Date): boolean {
  return endDate.getTime() >= startDate.getTime();
}

/**
 * Whether the stale sweep may run for this invocation.
 *
 * Phase 3 closes a mandate whose commune is absent from the file. Under `--limit` the file it
 * compares against is a truncated slice, so "absent from the file" silently means "past the
 * limit": a 100-row preview reported 21 592 closures against a 34 687-row register. The sweep
 * only means anything when the whole file was read.
 */
export function shouldRunStaleSweep(options: { limit?: number }): boolean {
  return options.limit === undefined;
}

/**
 * How far apart two terms of the same person must start to be two terms.
 *
 * A register that has not caught up repeats the start date of the term we already closed,
 * give or take how each source rounds it. A genuine re-election is years later: the closest
 * real pair measured on the register starts 130 days apart, a mayor who took office mid-term
 * in November 2025 and was re-elected in March 2026. A month leaves that untouched and still
 * catches a repeat.
 */
const TERM_SEPARATION_MS = 31 * 86_400_000;

/**
 * Whether the register is opening a later term, or repeating one we already hold.
 *
 * Compared on the START date, never on the end. `reconcile-municipales` closed the 2020 terms
 * on 26 March 2026 while the register opens the new ones on the 20th, so every legitimate
 * re-election overlaps its own predecessor by six days: 1 526 of 1 607 would be rejected by an
 * end-date comparison. 69 of those closed mandates have no end date at all.
 *
 * Getting this wrong revives a former mayor. `reconcile-municipales` only creates successors
 * above 1 000 inhabitants, so a smaller commune can sit with no mayor at all, and an
 * out-of-date register naming its former one would reopen a term overlapping the closed one.
 */
export function isFurtherTerm(priorStart: Date, registerStart: Date): boolean {
  return registerStart.getTime() - priorStart.getTime() > TERM_SEPARATION_MS;
}

/** What Phase 2 does with a profile Phase 1 just created. */
export type Phase2Action = "merge" | "draft" | "keep";

/**
 * What to do with a freshly imported profile once the resolver has judged it.
 *
 * `merge` moves its mandates onto the existing profile and DELETES it, which cannot be undone.
 * It needs a confirmed identity, and nothing less.
 *
 * `draft` is the answer to a doubt. The resolver says this mayor may be someone we already
 * hold, without being sure. Publishing them anyway puts a second profile of a real person on a
 * transparency site, and nothing downstream would flag it: the merge step skipped these rows
 * and its report did not even count them. Measured on the register, 2 647 of the 12 004
 * profiles an import would create land here.
 *
 * `keep` is for a mayor with no namesake at all, 9 262 of them. A new person, not a doubt.
 * The resolver spells that one `"NEW"`, which is a fourth state next to the three judgements.
 */
export function decidePhase2Action(judgement: Judgement | "NEW" | null): Phase2Action {
  if (judgement === Judgement.SAME) return "merge";
  if (judgement === Judgement.UNDECIDED) return "draft";
  return "keep";
}

/** What Phase 1 does with one register row. Nothing here writes; the caller executes. */
export type Phase1Action =
  | "update"
  | "close-and-create"
  | "adopt"
  | "close-incumbent-and-create"
  | "new-term"
  | "create"
  | "skip";

/**
 * The seven paths Phase 1 can take, as one pure decision.
 *
 * They were scattered across nested branches, and every guard added over successive reviews
 * opened a path nobody had named: an UNDECIDED that created a duplicate, a DIFFERENT that
 * left two current mayors, a close that predated its own start. Pulling the decision out
 * makes each combination visible and testable in a table, and leaves the caller with nothing
 * to decide.
 *
 * `skip` is the answer to every doubt: it writes nothing and the row is reported.
 */
export function decidePhase1Action(input: {
  /** The register-sourced mandate for this INSEE code, if we still hold one. */
  existing: { verdict: HolderVerdict; closable: boolean } | null;
  /** False when the INSEE code is absent from our Commune table: no safe incumbent lookup. */
  hasCommuneId: boolean;
  /** A current mayor for the same commune under any other source. */
  incumbent: { verdict: HolderVerdict; closable: boolean } | null;
  /**
   * A closed mandate for this commune. It answers "do we already hold this person", never
   * "who is mayor": a closed mandate makes no claim about the present.
   */
  priorTerm: { verdict: HolderVerdict; furtherTerm: boolean } | null;
}): Phase1Action {
  if (input.existing) {
    if (input.existing.verdict === "SAME") return "update";
    if (input.existing.verdict === "UNDECIDED") return "skip";
    return input.existing.closable ? "close-and-create" : "skip";
  }

  if (input.hasCommuneId && input.incumbent) {
    if (input.incumbent.verdict === "SAME") return "adopt";
    if (input.incumbent.verdict === "UNDECIDED") return "skip";
    return input.incumbent.closable ? "close-incumbent-and-create" : "skip";
  }

  // Nobody is in place. A closed mandate held by the person the register names means either a
  // further term for them, or a register still describing the term we closed.
  if (input.priorTerm?.verdict === "SAME") {
    return input.priorTerm.furtherTerm ? "new-term" : "skip";
  }

  // We cannot tell whether the closed mandate is the same person. Creating would publish a
  // second profile for someone real, and Phase 2 would not merge it: `resolveBatch` looks
  // candidates up by normalized last name, which is exactly what differs in these rows
  // (a married name, or a typo in either name).
  if (input.priorTerm?.verdict === "UNDECIDED") return "skip";

  return "create";
}

/**
 * Whether the register row and the current holder of a mandate are the same person.
 *
 * Both verdicts need positive evidence, because both are acted on. SAME refreshes a profile's
 * civil status; DIFFERENT closes a sitting mayor's mandate and publishes a second profile for
 * the commune. Anything short of evidence is UNDECIDED, and UNDECIDED writes nothing.
 *
 * Evidence of the same person: the surnames agree and the resolver scores above AUTO_MATCH.
 * Evidence of a different person: two known birth dates that disagree, or two surnames with
 * nothing in common while both birth dates are known.
 *
 * What is deliberately NOT evidence of a different person:
 *
 * - A missing birth date on either side. The register lags the March 2026 municipal results,
 *   and mayors elected then often have no birth date on file: closing their mandate on a name
 *   comparison alone would let a stale register overrule an election.
 * - A low resolver score while the birth dates agree. The first-name signal knows only exact
 *   and substring, no edit distance, so "Franck" against "Frank" scores 0.36. A spelling
 *   variant is a question, not a succession.
 */
export function compareHolder(incoming: HolderFacts, current: HolderFacts): HolderVerdict {
  // First, because every verdict below rests on it. A comparison with an unknown birth date
  // on one side has no discriminating signal in either direction.
  if (incoming.birthDate === null || current.birthDate === null) return "UNDECIDED";

  const byName = nameVerdict(incoming.lastName, current.lastName);
  if (byName === "UNDECIDED") return "UNDECIDED";
  if (byName === "DIFFERENT") {
    // A name of use against a birth name. Two unrelated surnames on the same first name and
    // the same birth date is a woman who married or divorced, not a succession: measured on
    // the register, every single row of this shape is one. Calling it a succession would close
    // her mandate and publish her twice, once under each surname.
    const byFirstName = nameVerdict(incoming.firstName, current.firstName);
    const sameBirth = sameCalendarDay(incoming.birthDate, current.birthDate);
    return byFirstName === "SAME" && sameBirth ? "UNDECIDED" : "DIFFERENT";
  }

  const input: ScoringInput = {
    firstName: incoming.firstName ?? "",
    lastName: incoming.lastName ?? "",
    birthDate: incoming.birthDate,
  };

  const candidate: CachedPolitician = {
    id: "current-holder",
    firstName: current.firstName ?? "",
    lastName: current.lastName ?? "",
    birthDate: current.birthDate,
    departments: [],
    gender: null,
    prominenceScore: 0,
  };

  // `score` is the combiner's confidence: `CandidateMatch.confidence` does not exist, and the
  // `fellegiSunter` block that does carry one is only populated when a name-frequency cache is
  // passed in, which would mean a database read per row.
  const { score } = scoreCandidate(input, candidate, new Set<string>());
  if (score >= IDENTITY_THRESHOLDS.AUTO_MATCH) return "SAME";

  // Paris calendar day, not UTC: a birth date stored as Paris midnight sits at 23:00Z the day
  // before, while the register is parsed at noon UTC. Comparing UTC days would call two
  // identical dates different, and turn a spelling variant into a succession.
  return sameCalendarDay(incoming.birthDate, current.birthDate) ? "UNDECIDED" : "DIFFERENT";
}
