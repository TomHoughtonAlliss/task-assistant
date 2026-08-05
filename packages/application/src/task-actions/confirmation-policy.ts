import type { ProposedTaskAction } from "@task-assistant/domain";

/**
 * Decides whether application policy requires confirmation before executing an action.
 *
 * Failure modes / invariants:
 * - destructive deletes always require confirmation regardless of the model flag;
 * - all other action types honor the model's `requiresConfirmation` value.
 */
export function actionRequiresConfirmation(action: ProposedTaskAction): boolean {
  if (action.type === "delete_task") {
    return true;
  }

  return action.requiresConfirmation;
}
