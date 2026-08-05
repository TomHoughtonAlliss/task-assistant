import type { ProposedTaskAction, Task } from "@task-assistant/domain";
import { actionRequiresConfirmation } from "./confirmation-policy.js";
import type {
  ProposedActionValidationResult,
  ValidatedProposedAction,
} from "./types.js";
import type { TaskProviderCapabilities } from "../task-provider/index.js";

/**
 * Validates one proposed action against known tasks and provider capabilities.
 *
 * Failure modes:
 * - `unknown_task` when a referenced task id is outside the supplied candidate set;
 * - `unsupported_operation` when the provider cannot perform the mutation (except local snooze fallback);
 * - `missing_update_fields` when an update action changes nothing;
 * - `invalid_action` reserved for future structural rejects beyond schema parsing.
 */
export function validateProposedAction(input: {
  action: ProposedTaskAction;
  tasks: Task[];
  capabilities: TaskProviderCapabilities;
}): ProposedActionValidationResult {
  const { action, tasks, capabilities } = input;
  const taskIds = new Set(tasks.map((task) => task.id));

  switch (action.type) {
    case "create_task":
      if (!capabilities.createTask) {
        return unsupported(action, "create_task");
      }
      return ok(action);

    case "complete_task":
      if (!capabilities.completeTask) {
        return unsupported(action, "complete_task");
      }
      return requireKnownTask(action, action.taskId, taskIds);

    case "delete_task":
      if (!capabilities.deleteTask) {
        return unsupported(action, "delete_task");
      }
      return requireKnownTask(action, action.taskId, taskIds);

    case "reschedule_task":
      if (!capabilities.rescheduleTask) {
        return unsupported(action, "reschedule_task");
      }
      return requireKnownTask(action, action.taskId, taskIds);

    case "update_task":
      if (!capabilities.updateTask) {
        return unsupported(action, "update_task");
      }
      if (
        action.title === null &&
        action.description === null &&
        action.projectName === null
      ) {
        return {
          ok: false,
          action,
          error: {
            code: "missing_update_fields",
            message: "Update action must change at least one of title, description, or projectName",
          },
        };
      }
      return requireKnownTask(action, action.taskId, taskIds);

    case "snooze_task":
      // Local state-store snooze remains available when the provider cannot snooze natively.
      return requireKnownTask(action, action.taskId, taskIds);
  }
}

/**
 * Builds a successful validation result with application confirmation policy applied.
 */
function ok(action: ProposedTaskAction, taskId?: string): ProposedActionValidationResult {
  const value: ValidatedProposedAction = {
    action,
    requiresConfirmation: actionRequiresConfirmation(action),
  };
  if (taskId) {
    value.taskId = taskId;
  }
  return { ok: true, value };
}

/**
 * Rejects actions that reference a task id outside the supplied candidate set.
 */
function requireKnownTask(
  action: ProposedTaskAction,
  taskId: string,
  taskIds: ReadonlySet<string>,
): ProposedActionValidationResult {
  if (!taskIds.has(taskId)) {
    return {
      ok: false,
      action,
      error: {
        code: "unknown_task",
        message: `Action references unknown task id ${taskId}`,
      },
    };
  }

  return ok(action, taskId);
}

/**
 * Builds an unsupported-operation validation failure for one action type.
 */
function unsupported(
  action: ProposedTaskAction,
  operation: string,
): ProposedActionValidationResult {
  return {
    ok: false,
    action,
    error: {
      code: "unsupported_operation",
      message: `Task provider cannot perform ${operation}`,
    },
  };
}
