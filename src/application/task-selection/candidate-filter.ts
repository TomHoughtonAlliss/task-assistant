import type { SnoozeRecord } from "../state-store/index.js";
import { taskSchema, type Task, type TaskId } from "../../domain/index.js";

/**
 * Stable reason explaining why a task was excluded from candidate selection.
 */
export type TaskRejectionReason =
  | "snoozed"
  | "malformed_task";

/**
 * One rejected task plus the reasons it was excluded.
 */
export interface RejectedTask {
  /**
   * Task identifier when one could be recovered from provider data.
   */
  taskId?: TaskId;
  /**
   * Original task candidate that was rejected.
   */
  task: Task;
  /**
   * Deterministic reasons for excluding the task from selection.
   */
  reasons: TaskRejectionReason[];
}

/**
 * Final output of candidate filtering before ranking and model selection.
 */
export interface CandidateFilterResult {
  /**
   * Tasks still eligible for ranking and model selection.
   */
  eligibleTasks: Task[];
  /**
   * Tasks removed from consideration, with deterministic rejection reasons.
   */
  rejectedTasks: RejectedTask[];
}

/**
 * Filters out locally snoozed or malformed tasks before ranking begins.
 */
export function filterCandidateTasks(
  tasks: Task[],
  snoozes: SnoozeRecord[],
  now: string,
): CandidateFilterResult {
  const activeSnoozesByTaskId = new Map<string, SnoozeRecord[]>();

  for (const snooze of snoozes) {
    if (!isActiveSnooze(snooze, now)) {
      continue;
    }

    const existing = activeSnoozesByTaskId.get(snooze.taskId);
    if (existing) {
      existing.push(snooze);
      continue;
    }

    activeSnoozesByTaskId.set(snooze.taskId, [snooze]);
  }

  const eligibleTasks: Task[] = [];
  const rejectedTasks: RejectedTask[] = [];

  for (const task of tasks) {
    const reasons = collectTaskRejectionReasons(task, activeSnoozesByTaskId, now);

    if (reasons.length === 0) {
      eligibleTasks.push(task);
      continue;
    }

    rejectedTasks.push({
      taskId: task.id,
      task,
      reasons,
    });
  }

  return {
    eligibleTasks,
    rejectedTasks,
  };
}

/**
 * Returns whether one local snooze should still exclude a task at the supplied timestamp.
 */
function isActiveSnooze(snooze: SnoozeRecord, now: string): boolean {
  if (snooze.clearedAt) {
    return false;
  }

  return snooze.snoozedUntil > now;
}

/**
 * Collects deterministic reasons that make a task ineligible for today.
 */
function collectTaskRejectionReasons(
  task: Task,
  activeSnoozesByTaskId: ReadonlyMap<string, SnoozeRecord[]>,
  now: string,
): TaskRejectionReason[] {
  const reasons: TaskRejectionReason[] = [];

  if (!taskSchema.safeParse(task).success) {
    reasons.push("malformed_task");
  }

  if (activeSnoozesByTaskId.has(task.id)) {
    reasons.push("snoozed");
  }

  return reasons;
}
