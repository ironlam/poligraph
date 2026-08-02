/**
 * Assisted triage of the affair-matching review queue.
 *
 * A single person cannot outpace twelve to eighteen new decisions a day, and the
 * July pass proved the point in the worst way: it ran from a throwaway script
 * that was deleted afterwards, so the capacity to review disappeared with the
 * file and the backlog grew straight back. This module is the durable form of
 * that pass, and it lives in src/ rather than in the script so its rule can be
 * tested without a database.
 *
 * **One rule, deliberately.** Only decisions whose every candidate is a
 * vocabulary artefact are resolved, and only out of scope. Nothing is ever
 * auto-confirmed: the measurement found zero queued decisions carrying a
 * deterministic external-id match, so every confirmation left in the queue is a
 * judgment call and belongs to a human.
 *
 * Two rules from the July pass are known not to generalise and must not come
 * back (see the project memory on triage):
 *  - `name-quality < 3` would close real affairs. The French press names by bare
 *    surname; that is the norm, not a weak signal.
 *  - auto-rejecting on `role-context` or `context-plausibility` fires on former
 *    office-holders and on EU contexts, so it discards genuine convictions.
 */

import type { SurnameVocabulary } from "./surname-ambiguity";
import { normalizeForMatching } from "./surname-ambiguity";
import { RESOLVER_VERSION } from "./signals/constants";

/**
 * Version marker written to `reviewedBy`. It is not in HUMAN_REVIEWERS, so
 * `review-provenance` classifies it as assisted and the publish guard keeps
 * asking for a human before anything goes public.
 *
 * The version is part of the marker on purpose: it makes a whole batch
 * revocable by a single query when a rule turns out to be wrong. v1 was the
 * July pass, written as the bare string `auto-triage`.
 */
export const TRIAGE_VERSION = "auto-triage-v2";

/** Names the July pass used, kept so a revoke can still reach that batch. */
export const KNOWN_TRIAGE_VERSIONS = ["auto-triage", "auto-triage-v2"] as const;

export interface TriageSignal {
  signalId: string;
  logLikelihoodRatio: number;
  evidence?: { matchType?: string } | null;
}

export interface TriageCandidate {
  candidateId: string;
  totalScore: number;
  signals: TriageSignal[];
}

export interface TriageRow {
  id: string;
  judgment: string;
  affairId: string | null;
  resolverVersion: string;
  candidates: TriageCandidate[];
}

export type TriageVerdict =
  | { kind: "OUT_OF_SCOPE"; reason: string }
  | { kind: "KEEP"; reason: string };

/** Surname lookup for a candidate, resolved by the caller from the pool. */
export type SurnameOf = (candidateId: string) => string | null;

/** Judgments a decision may still be sitting in when triage looks at it. */
const TRIAGEABLE_JUDGMENTS = new Set(["NO_MATCH", "UNDECIDED"]);

/**
 * A candidate whose only evidence is a surname that the vocabulary flags as an
 * ordinary word of the text. Accepts both match types: rows scored before the
 * penalty shipped carry SURNAME_ONLY, rows scored after carry
 * SURNAME_ONLY_AMBIGUOUS, and both describe the same situation.
 */
function isVocabularyArtefact(
  candidate: TriageCandidate,
  vocabulary: SurnameVocabulary,
  surnameOf: SurnameOf
): boolean {
  const surname = surnameOf(candidate.candidateId);
  if (!surname) return false;

  const nameQuality = candidate.signals.find((s) => s.signalId === "name-quality");
  const matchType = nameQuality?.evidence?.matchType;
  if (matchType !== "SURNAME_ONLY" && matchType !== "SURNAME_ONLY_AMBIGUOUS") return false;

  return vocabulary.lookup(normalizeForMatching(surname)) !== null;
}

/**
 * Decides whether a queued decision can be closed without a human reading it.
 *
 * Every guard below is a refusal, and each one is there because the opposite
 * would be a silent loss: a real attribution dropped from the queue is never
 * seen again, while noise left in it costs a click.
 */
export function classifyForTriage(
  row: TriageRow,
  vocabulary: SurnameVocabulary,
  surnameOf: SurnameOf
): TriageVerdict {
  // The guard that makes this safe by construction rather than by documentation.
  //
  // A row scored before the current resolver carries a candidate list the current
  // resolver would not produce. Closing it out of scope would record an editorial
  // judgment about a text the resolver had not properly read: the pre-v2 sample
  // was full of Marine Le Pen convictions whose only candidates were artefacts,
  // because the four character floor made her surname unreachable. Those rows need
  // re-resolving, not closing.
  if (row.resolverVersion !== RESOLVER_VERSION) {
    return {
      kind: "KEEP",
      reason: `scorée par ${row.resolverVersion}, à re-résoudre avant tout tri`,
    };
  }

  if (!TRIAGEABLE_JUDGMENTS.has(row.judgment)) {
    return { kind: "KEEP", reason: `jugement ${row.judgment} hors périmètre` };
  }

  // An attached decision can block a publication, so a person decides it. The
  // panel added in #613 makes that a two-click job from the affair itself.
  if (row.affairId !== null) {
    return { kind: "KEEP", reason: "rattachée à une affaire" };
  }

  // No candidate at all is the discovery queue: the text may name a politician
  // missing from the base. Telling that apart from a text about a private person
  // means reading it.
  if (row.candidates.length === 0) {
    return { kind: "KEEP", reason: "aucun candidat, file de découverte" };
  }

  const artefacts = row.candidates.filter((c) => isVocabularyArtefact(c, vocabulary, surnameOf));
  if (artefacts.length !== row.candidates.length) {
    return {
      kind: "KEEP",
      reason: `${row.candidates.length - artefacts.length} candidat(s) hors vocabulaire`,
    };
  }

  return {
    kind: "OUT_OF_SCOPE",
    reason: `les ${row.candidates.length} candidats tiennent à un patronyme ambigu`,
  };
}

/**
 * Letters and digits only, single-spaced. Deliberately looser than the resolver's
 * normalizer: this check exists to disagree with the pipeline, so it must not
 * reuse the tokenizing decisions the pipeline made.
 */
export function looseWords(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

/**
 * Names a text mentions in full that are not among its candidates.
 *
 * The last line of defence before closing a row, and the one that earns its
 * keep: it reads the text against the whole name index instead of trusting the
 * prefilter, so it catches a blind spot without having to know which one. It
 * found « Marine Le Pen's appeal » after three separate normalizer fixes had
 * each looked like the last.
 *
 * A hit does not mean the row is wrong, only that a person should look. Callers
 * drop the row from the batch rather than failing the batch, so a false positive
 * costs one line instead of the whole pass.
 */
export function unproposedNames(
  text: string,
  candidateIds: ReadonlySet<string>,
  fullNameIndex: ReadonlyMap<string, readonly string[]>,
  maxWords: number
): string[] {
  const words = looseWords(text);
  const found = new Set<string>();
  for (let n = 2; n <= maxWords; n++) {
    for (let i = 0; i + n <= words.length; i++) {
      for (const id of fullNameIndex.get(words.slice(i, i + n).join(" ")) ?? []) {
        if (!candidateIds.has(id)) found.add(id);
      }
    }
  }
  return [...found];
}
