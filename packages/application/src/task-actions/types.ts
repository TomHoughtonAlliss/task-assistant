import type { ProposedTaskAction, Task } from "@task-assistant/domain";
import type { ActionRecord, StateStore } from "../state-store/index.js";
import type { TaskProvider } from "../task-provider/index.js";

/**
 * Stable category for proposed-action validation failures.
 */
export type ProposedActionValidationErrorCode =
  | "unknown_task"
  | "unsupported_operation"
  | "invalid_action"
  | "missing_update_fields";

/**
 * Normalized validation failure for one proposed action.
 */
export interface ProposedActionValidationError {
  /**
   * Stable application-facing failure category.
   */
  code: ProposedActionValidationErrorCode;
  /**
   * Human-readable explanation suitable for logs and optional user-facing notes.
   */
  message: string;
}

/**
 * One proposed action that passed validation and is ready to persist or execute.
 */
export interface ValidatedProposedAction {
  /**
   * Original structured action returned by the model.
   */
  action: ProposedTaskAction;
  /**
   * Whether application policy requires an explicit user confirmation before execution.
   */
  requiresConfirmation: boolean;
  /**
   * Optional task referenced by the action when one exists.
   */
  taskId?: string;
}

/**
 * Result of validating one proposed action against available tasks and provider capabilities.
 */
export type ProposedActionValidationResult =
  | {
      ok: true;
      value: ValidatedProposedAction;
    }
  | {
      ok: false;
      error: ProposedActionValidationError;
      action: ProposedTaskAction;
    };

/**
 * Outcome recorded after attempting to persist and optionally execute one validated action.
 */
export type ProposedActionProcessingOutcome =
  | {
      status: "awaiting_confirmation";
      record: ActionRecord;
      action: ProposedTaskAction;
    }
  | {
      status: "executed";
      record: ActionRecord;
      action: ProposedTaskAction;
    }
  | {
      status: "failed";
      record: ActionRecord;
      action: ProposedTaskAction;
      message: string;
    }
  | {
      status: "skipped_duplicate";
      record: ActionRecord;
      action: ProposedTaskAction;
    }
  | {
      status: "rejected";
      record: ActionRecord;
      action: ProposedTaskAction;
    }
  | {
      status: "rejected_invalid";
      action: ProposedTaskAction;
      message: string;
    };

/**
 * Aggregated result of processing every proposed action from one conversational turn.
 */
export interface ProcessProposedActionsResult {
  /**
   * Per-action outcomes in proposal order.
   */
  outcomes: ProposedActionProcessingOutcome[];
}

/**
 * Dependencies required to validate and execute proposed task actions.
 */
export interface TaskActionProcessorDependencies {
  /**
   * Task-system boundary used for capability checks and mutations.
   */
  taskProvider: TaskProvider;
  /**
   * Persistence boundary used for action records and local snoozes.
   */
  stateStore: StateStore;
}

/**
 * Input required to process proposed actions from one conversational turn.
 */
export interface ProcessProposedActionsInput {
  /**
   * Conversation that produced the proposals.
   */
  conversationId: string;
  /**
   * Inbound message identifier used for correlation and idempotency.
   */
  sourceMessageId: string;
  /**
   * Candidate tasks available for grounding task-id validation.
   */
  tasks: Task[];
  /**
   * Structured actions proposed by the model for this turn.
   */
  proposedActions: ProposedTaskAction[];
  /**
   * Absolute timestamp used when writing action and snooze records.
   */
  occurredAt: string;
}

/**
 * Interpretation of a user reply against outstanding proposed actions.
 */
export type PendingActionDecision = "confirm" | "reject" | "none";

/**
 * Aggregated result of resolving outstanding proposed actions after a user reply.
 */
export interface ResolvePendingActionsResult {
  /**
   * Decision derived from the inbound user text.
   */
  decision: PendingActionDecision;
  /**
   * Per-action outcomes when confirmation or rejection was applied.
   */
  outcomes: ProposedActionProcessingOutcome[];
  /**
   * Short user-facing acknowledgement when pending actions were resolved.
   */
  acknowledgement?: string;
}
