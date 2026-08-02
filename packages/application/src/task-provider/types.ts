import { z } from "zod";
import type { Task, TaskDueDate, TaskId, TaskPriority } from "@task-assistant/domain";

/**
 * Stable identifier for a task provider implementation.
 */
export const taskProviderNameSchema = z.enum(["todoist"]);

/**
 * Stable identifier for a task provider implementation.
 */
export type TaskProviderName = z.infer<typeof taskProviderNameSchema>;

/**
 * Classifies provider errors into application-relevant categories.
 */
export const taskProviderErrorCodeSchema = z.enum([
  "not_found",
  "validation_failed",
  "authentication_failed",
  "permission_denied",
  "rate_limited",
  "temporary_failure",
  "unsupported_operation",
  "unknown",
]);

/**
 * Classifies provider errors into application-relevant categories.
 */
export type TaskProviderErrorCode = z.infer<typeof taskProviderErrorCodeSchema>;

/**
 * Normalised provider error surfaced to application use cases.
 */
export interface TaskProviderError {
  /**
   * Stable application-facing category for the failure.
   */
  code: TaskProviderErrorCode;
  /**
   * Human-readable failure message suitable for logs and debugging.
   */
  message: string;
  /**
   * Marks whether retrying the same request may succeed without input changes.
   */
  retriable: boolean;
  /**
   * Optional provider-owned metadata retained for debugging at the infrastructure edge.
   */
  details?: Record<string, string>;
}

/**
 * Success or failure result returned from provider operations.
 */
export type TaskProviderResult<T> =
  | {
      ok: true;
      value: T;
    }
  | {
      ok: false;
      error: TaskProviderError;
    };

/**
 * Source facts needed to create a new provider task.
 */
export interface CreateTaskInput {
  /**
   * User-visible task title.
   */
  title: string;
  /**
   * Optional descriptive notes for the new task.
   */
  description?: string;
  /**
   * Optional plain project or list name.
   */
  projectName?: string;
  /**
   * Optional due date to assign at creation time.
   */
  dueDate?: TaskDueDate;
  /**
   * Optional explicit priority for the new task.
   */
  priority?: TaskPriority;
}

/**
 * Non-destructive task fields that can be updated without changing completion state.
 */
export interface UpdateTaskInput {
  /**
   * Target task identifier.
   */
  taskId: TaskId;
  /**
   * Optional replacement title.
   */
  title?: string;
  /**
   * Optional replacement description.
   */
  description?: string;
  /**
   * Optional replacement plain project or list name.
   */
  projectName?: string;
  /**
   * Optional replacement explicit priority.
   */
  priority?: TaskPriority;
}

/**
 * Input for rescheduling a task to a different due date.
 */
export interface RescheduleTaskInput {
  /**
   * Target task identifier.
   */
  taskId: TaskId;
  /**
   * New due date for the task.
   */
  dueDate: TaskDueDate;
}

/**
 * Input for temporarily snoozing or deprioritising a task at the provider boundary.
 */
export interface SnoozeTaskInput {
  /**
   * Target task identifier.
   */
  taskId: TaskId;
  /**
   * Timestamp until which the task should be snoozed, when supported.
   */
  until: string;
  /**
   * Optional reason retained when the provider supports annotations.
   */
  reason?: string;
}

/**
 * Describes whether the provider can apply a given operation directly.
 */
export interface TaskProviderCapabilities {
  /**
   * Provider can read incomplete tasks.
   */
  listIncompleteTasks: true;
  /**
   * Provider can read a task by identifier.
   */
  getTaskById: boolean;
  /**
   * Provider can create tasks.
   */
  createTask: boolean;
  /**
   * Provider can update non-destructive fields such as title or description.
   */
  updateTask: boolean;
  /**
   * Provider can move a due date to a new value.
   */
  rescheduleTask: boolean;
  /**
   * Provider can complete a task.
   */
  completeTask: boolean;
  /**
   * Provider can delete a task.
   */
  deleteTask: boolean;
  /**
   * Provider can represent a temporary snooze or defer action directly.
   */
  snoozeTask: boolean;
}

/**
 * Application-facing interface for task retrieval and controlled task mutations.
 */
export interface TaskProvider {
  /**
   * Stable provider name used by runtime wiring and logging.
   */
  readonly name: TaskProviderName;
  /**
   * Declares which task operations this provider implementation can perform.
   */
  readonly capabilities: TaskProviderCapabilities;
  /**
   * Returns current incomplete tasks mapped into the shared domain model.
   */
  listIncompleteTasks(): Promise<TaskProviderResult<Task[]>>;
  /**
   * Reads one task by identifier when validation or reconciliation needs current provider state.
   */
  getTaskById(taskId: TaskId): Promise<TaskProviderResult<Task | null>>;
  /**
   * Creates a new task from shared domain input.
   */
  createTask(input: CreateTaskInput): Promise<TaskProviderResult<Task>>;
  /**
   * Updates non-destructive task fields through the provider boundary.
   */
  updateTask(input: UpdateTaskInput): Promise<TaskProviderResult<Task>>;
  /**
   * Moves a task's due date through the provider boundary.
   */
  rescheduleTask(input: RescheduleTaskInput): Promise<TaskProviderResult<Task>>;
  /**
   * Marks an existing task as completed.
   */
  completeTask(taskId: TaskId): Promise<TaskProviderResult<Task>>;
  /**
   * Deletes an existing task through the provider boundary.
   */
  deleteTask(taskId: TaskId): Promise<TaskProviderResult<void>>;
  /**
   * Applies a temporary snooze or equivalent defer action when supported.
   */
  snoozeTask(input: SnoozeTaskInput): Promise<TaskProviderResult<Task>>;
}
