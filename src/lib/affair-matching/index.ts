export {
  resolveAffairPolitician,
  scoreAffairAgainstCandidates,
  type ResolveResult,
} from "./resolver";
export {
  computeTextHash,
  loadCandidatePool,
  loadBlocklist,
  persistDecision,
  type PersistInput,
  type PersistResult,
} from "./persistence";
export { AffairCombiner, type CombinerDecision, type AffairJudgment } from "./combiner";
export type {
  AffairSignalEvaluator,
  AffairSignalResult,
  AffairScoringInput,
  AffairCandidateRecord,
  AffairSignalContext,
} from "./signals/types";
export { AffairSignalTier } from "./signals/types";
export {
  assessPressAttribution,
  type AttributionGuardInput,
  type AttributionGuardResult,
  type AttributionVerdict,
  type GuardInvolvement,
} from "./attribution-guard";
export {
  assessProcedureEvidence,
  type ProcedureGuardInput,
  type ProcedureGuardResult,
  type ProcedureVerdict,
} from "./procedure-guard";
