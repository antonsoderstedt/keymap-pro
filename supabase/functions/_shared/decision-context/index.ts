export * from "./constants.ts";
export * from "./types.ts";
export {
  resolveScopeForActionItem,
  resolveScopeForAdsProposal,
  type ActionItemLite,
  type AdsProposalLite,
} from "./scope.ts";
export { selectWhatChanged } from "./what_changed.ts";
export { selectCausalSignals } from "./causal.ts";
export { selectRelatedSignals } from "./related.ts";
export { selectRecentChanges } from "./recent_changes.ts";
export { selectHistoricalAnalogs, jaccardSimilarity } from "./analogs.ts";
export { deriveRisk } from "./risk.ts";
export { assembleEvidence, buildExcerptMap, formatSignalExcerpt, formatCausalExcerpt } from "./evidence.ts";
export { selectRecommendedNextStep } from "./next_step.ts";
export { computeDecisionConfidence } from "./confidence.ts";
export { validateNarrative, extractClaimIds } from "./narrative.ts";
export { canonicalJSON, hashCanonical, sha256Hex } from "./hash.ts";
export {
  buildDecisionContext,
  type BuildDecisionContextInput,
  type BuildDecisionContextResult,
  type DecisionContextV1,
} from "./build.ts";
