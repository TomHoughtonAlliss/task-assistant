export { actionRequiresConfirmation } from "./confirmation-policy.js";
export {
  executeValidatedAction,
  markActionConfirmed,
  markActionExecuted,
  markActionFailed,
  markActionRejected,
} from "./execute-action.js";
export { buildActionIdempotencyKey } from "./idempotency.js";
export {
  executeAndPersist,
  processProposedActions,
} from "./process-proposed-actions.js";
export {
  appendActionOutcomeNotes,
  interpretPendingActionDecision,
  resolvePendingActions,
  selectCurrentPendingBatch,
  summarizeActionOutcomes,
} from "./resolve-pending-actions.js";
export { validateProposedAction } from "./validate-proposed-action.js";
export type {
  PendingActionDecision,
  ProcessProposedActionsInput,
  ProcessProposedActionsResult,
  ProposedActionProcessingOutcome,
  ProposedActionValidationError,
  ProposedActionValidationErrorCode,
  ProposedActionValidationResult,
  ResolvePendingActionsResult,
  TaskActionProcessorDependencies,
  ValidatedProposedAction,
} from "./types.js";
