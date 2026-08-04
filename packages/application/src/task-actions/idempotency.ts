import { createHash } from "node:crypto";
import type { ProposedTaskAction } from "@task-assistant/domain";

/**
 * Builds a stable idempotency key for one proposed action within a conversation turn.
 *
 * Inputs:
 * - conversation and source message identify the originating turn;
 * - the action fingerprint ignores `requiresConfirmation` so confirmation flips do not create duplicates.
 *
 * Outputs a deterministic key suitable for `StateStore.getActionRecordByIdempotencyKey`.
 */
export function buildActionIdempotencyKey(input: {
  conversationId: string;
  sourceMessageId: string;
  action: ProposedTaskAction;
}): string {
  const fingerprint = createHash("sha256")
    .update(canonicalizeAction(input.action))
    .digest("hex")
    .slice(0, 24);

  return `${input.conversationId}:${input.sourceMessageId}:${input.action.type}:${fingerprint}`;
}

/**
 * Serializes action fields that uniquely identify the intended mutation.
 */
function canonicalizeAction(action: ProposedTaskAction): string {
  switch (action.type) {
    case "create_task":
      return JSON.stringify({
        type: action.type,
        title: action.title,
        description: action.description,
        projectName: action.projectName,
        dueDate: action.dueDate,
      });
    case "complete_task":
    case "delete_task":
      return JSON.stringify({
        type: action.type,
        taskId: action.taskId,
      });
    case "snooze_task":
      return JSON.stringify({
        type: action.type,
        taskId: action.taskId,
        until: action.until,
        reason: action.reason,
      });
    case "reschedule_task":
      return JSON.stringify({
        type: action.type,
        taskId: action.taskId,
        dueDate: action.dueDate,
      });
    case "update_task":
      return JSON.stringify({
        type: action.type,
        taskId: action.taskId,
        title: action.title,
        description: action.description,
        projectName: action.projectName,
      });
  }
}
