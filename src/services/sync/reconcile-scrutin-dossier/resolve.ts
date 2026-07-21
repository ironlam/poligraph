import type { ResolverMaps } from "./maps";
import { billPhrase, jaccard, tokenize } from "./text";
import { TITLE_MATCH_MIN_MARGIN, TITLE_MATCH_MIN_SCORE, type Resolution } from "./types";

export interface ResolveInput {
  uid: string;
  seanceRef: string | null;
  title: string;
}

export interface ResolveOutcome {
  resolvedDossierExternalId: string | null;
  resolution: Resolution;
  bestScore?: number;
  margin?: number;
  candidateExternalIds: string[];
  /** Per-candidate alias-max scores (the same `scored` this resolver picks
   *  bestScore/margin from), sorted desc. Only populated for the multi-candidate
   *  TITLE_MATCH and AMBIGUOUS paths: VOTE_REF/SINGLE_SESSION/UNMATCHED have no
   *  meaningful multi-candidate scoring. Callers (e.g. the #477 clears audit)
   *  should use this instead of recomputing a score from the persisted dossier
   *  title alone, since the resolver's real score is a max over three aliases
   *  (titre, titreChemin, senatChemin), not the plain title. */
  candidateScores?: { externalId: string; score: number }[];
}

export function resolveScrutinDossier(input: ResolveInput, maps: ResolverMaps): ResolveOutcome {
  // 1. Authoritative voteRef anchor (fails closed when duplicated).
  const voteHit = maps.voteRefToDossiers.get(input.uid);
  if (voteHit && voteHit.size === 1) {
    const ext = [...voteHit][0]!;
    return { resolvedDossierExternalId: ext, resolution: "VOTE_REF", candidateExternalIds: [ext] };
  }
  if (voteHit && voteHit.size > 1) {
    // Duplicate voteRef: fail closed, but surface the colliding dossier ids for audit.
    return {
      resolvedDossierExternalId: null,
      resolution: "UNMATCHED",
      candidateExternalIds: [...voteHit],
    };
  }

  const candidates = input.seanceRef ? (maps.reunionToDossiers.get(input.seanceRef) ?? []) : [];
  if (candidates.length === 0) {
    return { resolvedDossierExternalId: null, resolution: "UNMATCHED", candidateExternalIds: [] };
  }
  if (candidates.length === 1) {
    return {
      resolvedDossierExternalId: candidates[0]!,
      resolution: "SINGLE_SESSION",
      candidateExternalIds: candidates,
    };
  }

  // 3. Multiple candidates: title-match within the candidate set.
  const phrase = billPhrase(input.title);
  const phraseTokens = phrase ? tokenize(phrase) : tokenize(input.title);
  const scored = candidates
    .map((ext) => {
      const aliases = maps.dossierAliases.get(ext) ?? [];
      const best = aliases.reduce((m, a) => Math.max(m, jaccard(phraseTokens, a)), 0);
      return { ext, score: best };
    })
    .sort((a, b) => b.score - a.score);

  const best = scored[0]!;
  const second = scored[1] ?? { score: 0 };
  const margin = best.score - second.score;
  const candidateScores = scored.map((s) => ({ externalId: s.ext, score: s.score }));
  if (best.score >= TITLE_MATCH_MIN_SCORE && margin >= TITLE_MATCH_MIN_MARGIN) {
    return {
      resolvedDossierExternalId: best.ext,
      resolution: "TITLE_MATCH",
      bestScore: best.score,
      margin,
      candidateExternalIds: candidates,
      candidateScores,
    };
  }
  return {
    resolvedDossierExternalId: null,
    resolution: "AMBIGUOUS",
    bestScore: best.score,
    margin,
    candidateExternalIds: candidates,
    candidateScores,
  };
}
