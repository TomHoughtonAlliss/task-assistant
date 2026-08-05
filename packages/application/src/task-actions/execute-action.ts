import { randomUUID } from "node:crypto";
import type { ProposedTaskAction, Task } from "@task-assistant/domain";
import type {
  ActionRecord,
  SnoozeRecord,
  StateStore,
} from "../state-store/index.js";
import type {
  CreateTaskInput,
  RescheduleTaskInput,
  TaskProvider,
  UpdateTaskInput,
} from "../task-provider/index.js";
import type { ValidatedProposedAction } from "./types.js";

/**
 * Result of attempting to execute one validated action against provider or local state.
 */
export type ExecuteValidatedActionResult =
  | {
      ok: true;
      task?: Task;
    }
  | {
      ok: false;
      message: string;
    };

/**
 * Executes one validated proposed action through the task provider or local snooze store.
 *
 * Failure modes:
 * - returns provider error messages unchanged for failed mutations;
 * - snooze falls back to local `StateStore.saveSnooze` when the provider lacks snooze support.
 */
export async function executeValidatedAction(input: {
  validated: ValidatedProposedAction;
  taskProvider: TaskProvider;
  stateStore: StateStore;
  occurredAt: string;
}): Promise<ExecuteValidatedActionResult> {
  const { validated, taskProvider, stateStore, occurredAt } = input;
  const action = validated.action;

  switch (action.type) {
    case "create_task": {
      const createInput = toCreateTaskInput(action);
      const result = await taskProvider.createTask(createInput);
      if (!result.ok) {
        return { ok: false, message: result.error.message };
      }
      return { ok: true, task: result.value };
    }
    case "complete_task": {
      const result = await taskProvider.completeTask(action.taskId);
      if (!result.ok) {
        return { ok: false, message: result.error.message };
      }
      return { ok: true, task: result.value };
    }
    case "delete_task": {
      const result = await taskProvider.deleteTask(action.taskId);
      if (!result.ok) {
        return { ok: false, message: result.error.message };
      }
      return { ok: true };
    }
    case "reschedule_task": {
      const rescheduleInput: RescheduleTaskInput = {
        taskId: action.taskId,
        dueDate: {
          kind: "date",
          date: action.dueDate,
        },
      };
      const result = await taskProvider.rescheduleTask(rescheduleInput);
      if (!result.ok) {
        return { ok: false, message: result.error.message };
      }
      return { ok: true, task: result.value };
    }
    case "update_task": {
      const updateInput = toUpdateTaskInput(action);
      const result = await taskProvider.updateTask(updateInput);
      if (!result.ok) {
        return { ok: false, message: result.error.message };
      }
      return { ok: true, task: result.value };
    }
    case "snooze_task": {
      if (taskProvider.capabilities.snoozeTask) {
        const result = await taskProvider.snoozeTask({
          taskId: action.taskId,
          until: action.until,
          ...(action.reason ? { reason: action.reason } : {}),
        });
        if (!result.ok) {
          return { ok: false, message: result.error.message };
        }
        return { ok: true, task: result.value };
      }

      const snooze: SnoozeRecord = {
        id: randomUUID(),
        taskId: action.taskId,
        snoozedUntil: action.until,
        source: "assistant",
        createdAt: occurredAt,
      };
      if (action.reason) {
        snooze.reason = action.reason;
      }
      stateStore.saveSnooze(snooze);
      return { ok: true };
    }
  }
}

/**
 * Marks one action record as executed after a successful mutation.
 */
export function markActionExecuted(
  record: ActionRecord,
  executedAt: string,
  taskId?: string,
): ActionRecord {
  const executed: ActionRecord = {
    id: record.id,
    idempotencyKey: record.idempotencyKey,
    conversationId: record.conversationId,
    action: record.action,
    status: "executed",
    proposedAt: record.proposedAt,
    executedAt,
  };
  if (taskId) {
    executed.taskId = taskId;
  } else if (record.taskId) {
    executed.taskId = record.taskId;
  }
  if (record.sourceMessageId) {
    executed.sourceMessageId = record.sourceMessageId;
  }
  if (record.confirmedAt) {
    executed.confirmedAt = record.confirmedAt;
  }
  return executed;
}

/**
 * Marks one action record as failed after a mutation error.
 */
export function markActionFailed(
  record: ActionRecord,
  executedAt: string,
  errorMessage: string,
): ActionRecord {
  const failed: ActionRecord = {
    id: record.id,
    idempotencyKey: record.idempotencyKey,
    conversationId: record.conversationId,
    action: record.action,
    status: "failed",
    proposedAt: record.proposedAt,
    executedAt,
    errorMessage,
  };
  if (record.taskId) {
    failed.taskId = record.taskId;
  }
  if (record.sourceMessageId) {
    failed.sourceMessageId = record.sourceMessageId;
  }
  if (record.confirmedAt) {
    failed.confirmedAt = record.confirmedAt;
  }
  return failed;
}

/**
 * Marks one action record as confirmed immediately before execution.
 */
export function markActionConfirmed(
  record: ActionRecord,
  confirmedAt: string,
): ActionRecord {
  const confirmed: ActionRecord = {
    id: record.id,
    idempotencyKey: record.idempotencyKey,
    conversationId: record.conversationId,
    action: record.action,
    status: "confirmed",
    proposedAt: record.proposedAt,
    confirmedAt,
  };
  if (record.taskId) {
    confirmed.taskId = record.taskId;
  }
  if (record.sourceMessageId) {
    confirmed.sourceMessageId = record.sourceMessageId;
  }
  return confirmed;
}

/**
 * Marks one action record as rejected by the user.
 */
export function markActionRejected(record: ActionRecord): ActionRecord {
  const rejected: ActionRecord = {
    id: record.id,
    idempotencyKey: record.idempotencyKey,
    conversationId: record.conversationId,
    action: record.action,
    status: "rejected",
    proposedAt: record.proposedAt,
  };
  if (record.taskId) {
    rejected.taskId = record.taskId;
  }
  if (record.sourceMessageId) {
    rejected.sourceMessageId = record.sourceMessageId;
  }
  return rejected;
}

/**
 * Maps a create-task proposal into provider create input, dropping null optional fields.
 */
function toCreateTaskInput(action: Extract<ProposedTaskAction, { type: "create_task" }>): CreateTaskInput {
  const input: CreateTaskInput = {
    title: action.title,
  };
  if (action.description) {
    input.description = action.description;
  }
  if (action.projectName) {
    input.projectName = action.projectName;
  }
  if (action.dueDate) {
    input.dueDate = {
      kind: "date",
      date: action.dueDate,
    };
  }
  return input;
}

/**
 * Maps an update-task proposal into provider update input, dropping null optional fields.
 */
function toUpdateTaskInput(action: Extract<ProposedTaskAction, { type: "update_task" }>): UpdateTaskInput {
  const input: UpdateTaskInput = {
    taskId: action.taskId,
  };
  if (action.title !== null) {
    input.title = action.title;
  }
  if (action.description !== null) {
    input.description = action.description;
  }
  if (action.projectName !== null) {
    input.projectName = action.projectName;
  }
  return input;
}
