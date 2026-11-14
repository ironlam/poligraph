// Core resolver
export { resolve, resolveBatch, scoreCandidate } from "./resolver";

// Legacy types (preserved for backward compatibility)
export type {
  ResolveInput,
  ResolveResult,
  CandidateMatch,
  CachedPolitician,
  ScoringInput,
  LegacyScoringInput,
  BatchResolveInput,
  BatchResolveResult,
} from "./types";
export { IDENTITY_THRESHOLDS, BIRTHDATE_TOLERANCE_MS } from "./types";

// v2 signal pipeline
export type {
  SignalEvaluator,
  SignalResult,
  SignalScoringInput,
  SignalCandidateRecord,
  SignalScoringContext,
} from "./signals/types";
export { SignalTier } from "./signals/types";

// v2 adapter interfaces
export type {
  CountryAdapter,
  NameNormalizer,
  PhoneticEncoder,
  VariantResolver,
  BlockingKeyGenerator,
} from "./adapters/types";

// Adapter registry
export { getAdapter, getDefaultAdapter, registerAdapter } from "./adapters/registry";

// Combiners
export { LegacyCombiner } from "./combiner";
export type { CombinerResult } from "./combiner";
export { FellegiSunterCombiner } from "./fellegi-sunter-combiner";
export type {
  FellegiSunterResult,
  FellegiSunterConfig,
  HardPenalty,
} from "./fellegi-sunter-combiner";

// Phase 2 signals
export { NameFrequencySignal } from "./signals/name-frequency";
export { TemporalSignal } from "./signals/temporal";
export { PartyContextSignal } from "./signals/party-context";

// Frequency cache
export { NameFrequencyCache } from "./frequency";

// Comparators
export { JaroWinklerComparator } from "./comparators/jaro-winkler";
export { DamerauLevenshteinComparator } from "./comparators/damerau-levenshtein";
export { MongeElkanComparator } from "./comparators/monge-elkan";
export { PhoneticComparator } from "./comparators/phonetic";
export type { NameComparator } from "./comparators/types";
