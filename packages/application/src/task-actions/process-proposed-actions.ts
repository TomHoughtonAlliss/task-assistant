import { randomUUID } from "node:crypto";
import type { ActionRecord } from "../state-store/index.js";
import {
  executeValidatedAction,
  markActionConfirmed,
  markActionExecuted,
  markActionFailed,
  markActionRejected,
} from "./execute-action.js";
import { buildActionIdempotencyKey } from "./idempotency.js";
import type {
  ProcessProposedActionsInput,
  ProcessProposedActionsResult,
  ProposedActionProcessingOutcome,
  TaskActionProcessorDependencies,
  ValidatedProposedAction,
} from "./types.js";
import { validateProposedAction } from "./validate-proposed-action.js";

/**
 * Validates, persists, and optionally executes every proposed action from one conversational turn.
 *
 * Failure modes:
 * - invalid actions are recorded as `rejected_invalid` outcomes and never persisted;
 * - already-executed or previously rejected idempotency keys are skipped as duplicates;
 * - provider or local-mutation failures mark the action record as `failed`;
 * - older unresolved proposals for the conversation are superseded when a new turn proposes actions.
 */
export async function processProposedActions(
  dependencies: TaskActionProcessorDependencies,
  input: ProcessProposedActionsInput,
): Promise<ProcessProposedActionsResult> {
  if (input.proposedActions.length > 0) {
    supersedeStaleProposedActions(
      dependencies,
      input.conversationId,
      input.sourceMessageId,
    );
  }

  const outcomes: ProposedActionProcessingOutcome[] = [];

  for (const action of input.proposedActions) {
    const validation = validateProposedAction({
      action,
      tasks: input.tasks,
      capabilities: dependencies.taskProvider.capabilities,
    });

    if (!validation.ok) {
      outcomes.push({
        status: "rejected_invalid",
        action,
        message: validation.error.message,
      });
      continue;
    }

    outcomes.push(
      await persistAndMaybeExecute(dependencies, input, validation.value),
    );
  }

  return { outcomes };
}

/**
 * Persists one validated action and executes it immediately when confirmation is not required.
 */
async function persistAndMaybeExecute(
  dependencies: TaskActionProcessorDependencies,
  input: ProcessProposedActionsInput,
  validated: ValidatedProposedAction,
): Promise<ProposedActionProcessingOutcome> {
  const idempotencyKey = buildActionIdempotencyKey({
    conversationId: input.conversationId,
    sourceMessageId: input.sourceMessageId,
    action: validated.action,
  });
  const existing =
    dependencies.stateStore.getActionRecordByIdempotencyKey(idempotencyKey);

  if (existing?.status === "executed" || existing?.status === "rejected") {
    return {
      status: "skipped_duplicate",
      record: existing,
      action: validated.action,
    };
  }
  if (existing?.status === "proposed") {
    return {
      status: "awaiting_confirmation",
      record: existing,
      action: validated.action,
    };
  }
  if (existing?.status === "confirmed") {
    return executeAndPersist(
      dependencies,
      existing,
      validated,
      input.occurredAt,
    );
  }

  const proposedRecord = buildProposedActionRecord({
    validated,
    conversationId: input.conversationId,
    sourceMessageId: input.sourceMessageId,
    idempotencyKey,
    proposedAt: existing?.proposedAt ?? input.occurredAt,
    ...(existing ? { id: existing.id } : {}),
  });
  dependencies.stateStore.saveActionRecord(proposedRecord);
  const canonical =
    dependencies.stateStore.getActionRecordByIdempotencyKey(idempotencyKey) ??
    proposedRecord;

  if (canonical.status === "executed" || canonical.status === "rejected") {
    return {
      status: "skipped_duplicate",
      record: canonical,
      action: validated.action,
    };
  }
  if (validated.requiresConfirmation) {
    return {
      status: "awaiting_confirmation",
      record: canonical,
      action: validated.action,
    };
  }

  return executeAndPersist(
    dependencies,
    canonical,
    validated,
    input.occurredAt,
  );
}

/**
 * Confirms, executes, and persists the outcome for one already-stored action record.
 */
export async function executeAndPersist(
  dependencies: TaskActionProcessorDependencies,
  record: ActionRecord,
  validated: ValidatedProposedAction,
  occurredAt: string,
): Promise<ProposedActionProcessingOutcome> {
  const latest =
    dependencies.stateStore.getActionRecordByIdempotencyKey(
      record.idempotencyKey,
    ) ?? record;

  if (latest.status === "executed" || latest.status === "rejected") {
    return {
      status: "skipped_duplicate",
      record: latest,
      action: validated.action,
    };
  }

  const confirmed = markActionConfirmed(latest, occurredAt);
  dependencies.stateStore.saveActionRecord(confirmed);

  const execution = await executeValidatedAction({
    validated,
    taskProvider: dependencies.taskProvider,
    stateStore: dependencies.stateStore,
    occurredAt,
  });

  if (!execution.ok) {
    const failed = markActionFailed(confirmed, occurredAt, execution.message);
    dependencies.stateStore.saveActionRecord(failed);
    return {
      status: "failed",
      record: failed,
      action: validated.action,
      message: execution.message,
    };
  }

  const executed = markActionExecuted(
    confirmed,
    occurredAt,
    execution.task?.id,
  );
  dependencies.stateStore.saveActionRecord(executed);

  return {
    status: "executed",
    record: executed,
    action: validated.action,
  };
}

/**
 * Rejects unresolved proposals from earlier turns so a later "yes" cannot confirm stale actions.
 */
function supersedeStaleProposedActions(
  dependencies: TaskActionProcessorDependencies,
  conversationId: string,
  currentSourceMessageId: string,
): void {
  const pending = dependencies.stateStore.listActionRecordsForConversation(
    conversationId,
    "proposed",
  );

  for (const record of pending) {
    if (record.sourceMessageId === currentSourceMessageId) {
      continue;
    }

    dependencies.stateStore.saveActionRecord(markActionRejected(record));
  }
}

/**
 * Builds the initial persisted action record for a newly validated proposal.
 */
function buildProposedActionRecord(input: {
  id?: string;
  validated: ValidatedProposedAction;
  conversationId: string;
  sourceMessageId: string;
  idempotencyKey: string;
  proposedAt: string;
}): ActionRecord {
  const record: ActionRecord = {
    id: input.id ?? randomUUID(),
    idempotencyKey: input.idempotencyKey,
    conversationId: input.conversationId,
    action: {
      ...input.validated.action,
      requiresConfirmation: input.validated.requiresConfirmation,
    },
    status: "proposed",
    sourceMessageId: input.sourceMessageId,
    proposedAt: input.proposedAt,
  };

  if (input.validated.taskId) {
    record.taskId = input.validated.taskId;
  }

  return record;
}
