import { actionRequiresConfirmation } from "./confirmation-policy.js";
import { markActionRejected } from "./execute-action.js";
import { executeAndPersist } from "./process-proposed-actions.js";
import type { ActionRecord } from "../state-store/index.js";
import type {
  PendingActionDecision,
  ProcessProposedActionsResult,
  ProposedActionProcessingOutcome,
  ResolvePendingActionsResult,
  TaskActionProcessorDependencies,
  ValidatedProposedAction,
} from "./types.js";

const confirmationPattern =
  /^(yes|y|yeah|yep|yup|ok|okay|sure|please do|go ahead|confirm|do it)[.!]?$/i;
const rejectionPattern =
  /^(no|n|nope|cancel|don't|dont|do not|nevermind|never mind|nvm)[.!]?$/i;

/**
 * Interprets a short user reply as confirmation, rejection, or neither for pending actions.
 */
export function interpretPendingActionDecision(text: string): PendingActionDecision {
  const normalized = text.trim();
  if (confirmationPattern.test(normalized)) {
    return "confirm";
  }
  if (rejectionPattern.test(normalized)) {
    return "reject";
  }
  return "none";
}

/**
 * Resolves the latest outstanding proposal batch when the user sends a clear yes/no reply.
 *
 * Failure modes:
 * - returns `decision: "none"` when there are no pending actions or the text is ambiguous;
 * - only the newest `sourceMessageId` batch is confirmed or rejected, so a later "yes" cannot
 *   apply forgotten proposals from earlier turns;
 * - confirmation executes each pending action with the same dedupe/execution path as new proposals;
 * - rejection marks records as `rejected` without calling the task provider.
 */
export async function resolvePendingActions(
  dependencies: TaskActionProcessorDependencies,
  input: {
    conversationId: string;
    userMessage: string;
    occurredAt: string;
  },
): Promise<ResolvePendingActionsResult> {
  const pending = selectCurrentPendingBatch(
    dependencies.stateStore.listActionRecordsForConversation(
      input.conversationId,
      "proposed",
    ),
  );

  if (pending.length === 0) {
    return {
      decision: "none",
      outcomes: [],
    };
  }

  const decision = interpretPendingActionDecision(input.userMessage);
  if (decision === "none") {
    return {
      decision: "none",
      outcomes: [],
    };
  }

  if (decision === "reject") {
    const outcomes: ProposedActionProcessingOutcome[] = [];
    for (const record of pending) {
      const rejected = markActionRejected(record);
      dependencies.stateStore.saveActionRecord(rejected);
      outcomes.push({
        status: "rejected",
        record: rejected,
        action: rejected.action,
      });
    }

    return {
      decision: "reject",
      outcomes,
      acknowledgement: "Okay, cancelled — I won't make those changes.",
    };
  }

  const outcomes: ProposedActionProcessingOutcome[] = [];
  for (const record of pending) {
    const validated: ValidatedProposedAction = {
      action: record.action,
      requiresConfirmation: actionRequiresConfirmation(record.action),
    };
    if (record.taskId) {
      validated.taskId = record.taskId;
    }

    outcomes.push(
      await executeAndPersist(
        dependencies,
        record,
        validated,
        input.occurredAt,
      ),
    );
  }

  return {
    decision: "confirm",
    outcomes,
    acknowledgement: summarizeActionOutcomes(outcomes),
  };
}

/**
 * Restricts confirmation/rejection to the newest proposal batch for the conversation.
 *
 * Pending records are newest-first. When the newest record has a source message id, only
 * records from that same originating turn are included; otherwise only the newest record is used.
 */
export function selectCurrentPendingBatch(
  pendingNewestFirst: ActionRecord[],
): ActionRecord[] {
  const newest = pendingNewestFirst[0];
  if (!newest) {
    return [];
  }

  if (newest.sourceMessageId) {
    return pendingNewestFirst.filter(
      (record) => record.sourceMessageId === newest.sourceMessageId,
    );
  }

  return [newest];
}

/**
 * Builds a short user-facing summary of action processing outcomes.
 */
export function summarizeActionOutcomes(
  outcomes: ProposedActionProcessingOutcome[],
): string {
  const executed = outcomes.filter((outcome) => outcome.status === "executed");
  const awaiting = outcomes.filter(
    (outcome) => outcome.status === "awaiting_confirmation",
  );
  const failed = outcomes.filter((outcome) => outcome.status === "failed");
  const invalid = outcomes.filter(
    (outcome) => outcome.status === "rejected_invalid",
  );

  const parts: string[] = [];

  if (executed.length > 0) {
    parts.push(
      `Done: ${executed.map((outcome) => describeAction(outcome.action)).join("; ")}.`,
    );
  }

  if (awaiting.length > 0) {
    parts.push(
      `Reply yes to confirm: ${awaiting
        .map((outcome) => describeAction(outcome.action))
        .join("; ")}.`,
    );
  }

  if (failed.length > 0) {
    parts.push(
      `Couldn't apply: ${failed
        .map((outcome) => `${describeAction(outcome.action)} (${outcome.message})`)
        .join("; ")}.`,
    );
  }

  if (invalid.length > 0) {
    parts.push(
      `Skipped invalid actions: ${invalid
        .map((outcome) => `${describeAction(outcome.action)} (${outcome.message})`)
        .join("; ")}.`,
    );
  }

  return parts.join(" ");
}

/**
 * Appends action-outcome notes to a model reply when there is something the user should know.
 */
export function appendActionOutcomeNotes(
  message: string,
  result: ProcessProposedActionsResult,
): string {
  const notes = summarizeActionOutcomes(result.outcomes);
  if (!notes) {
    return message;
  }

  return `${message}\n\n${notes}`;
}

/**
 * Builds a concise human-readable label for one proposed action.
 */
function describeAction(
  action: ProposedActionProcessingOutcome["action"],
): string {
  switch (action.type) {
    case "create_task":
      return `create "${action.title}"`;
    case "complete_task":
      return `complete ${action.taskId}`;
    case "delete_task":
      return `delete ${action.taskId}`;
    case "snooze_task":
      return `snooze ${action.taskId}`;
    case "reschedule_task":
      return `reschedule ${action.taskId} to ${action.dueDate}`;
    case "update_task":
      return `update ${action.taskId}`;
  }
}
