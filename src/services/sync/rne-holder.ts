import { IDENTITY_THRESHOLDS, scoreCandidate } from "@/lib/identity";
import type { CachedPolitician, ScoringInput } from "@/lib/identity";

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
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

/**
 * Last names must agree before anything else is scored.
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
function lastNameVerdict(a: string | null, b: string | null): HolderVerdict {
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

/** What Phase 1 does with one register row. Nothing here writes; the caller executes. */
export type Phase1Action =
  | "update"
  | "close-and-create"
  | "adopt"
  | "close-incumbent-and-create"
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
}): Phase1Action {
  if (input.existing) {
    if (input.existing.verdict === "SAME") return "update";
    if (input.existing.verdict === "UNDECIDED") return "skip";
    return input.existing.closable ? "close-and-create" : "skip";
  }

  if (!input.hasCommuneId || !input.incumbent) return "create";
  if (input.incumbent.verdict === "SAME") return "adopt";
  if (input.incumbent.verdict === "UNDECIDED") return "skip";
  return input.incumbent.closable ? "close-incumbent-and-create" : "skip";
}

/**
 * Whether the register row and the current holder of a mandate are the same person.
 *
 * Goes through the identity resolver rather than comparing strings: a name alone is not an
 * identity (two different people shared a birth date in La Bourboule) and an exact match is
 * not a requirement either (the register carries civil names, our base often carries usage
 * names). Three verdicts, per the project rule that only a score above AUTO_MATCH links
 * automatically and anything in between needs a human.
 *
 * Without a birth date on either side the comparison has no discriminating signal, so the
 * answer is UNDECIDED and the caller leaves the row alone.
 */
export function compareHolder(incoming: HolderFacts, current: HolderFacts): HolderVerdict {
  const byName = lastNameVerdict(incoming.lastName, current.lastName);
  if (byName !== "SAME") return byName;
  if (incoming.birthDate === null || current.birthDate === null) return "UNDECIDED";

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
  if (score < IDENTITY_THRESHOLDS.REVIEW) return "DIFFERENT";
  return "UNDECIDED";
}
