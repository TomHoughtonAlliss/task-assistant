import type { DailyRunGuard } from "../daily-run-guard/daily-run-guard.js";
import type { DailyReviewPersistence } from "../daily-review-persistence/index.js";
import type { MessageChannel } from "../message-channel/index.js";
import type { ModelProvider } from "../model-provider/index.js";
import type { Scheduler } from "../scheduler/index.js";
import type { DailyRunRecord } from "../state-store/index.js";
import type { StateStore } from "../state-store/index.js";
import type { TaskProvider } from "../task-provider/index.js";
import type { DailySchedulerHandlerInput } from "../scheduler/index.js";

/**
 * Dependency bundle required by the daily-review orchestration use case.
 */
export interface DailyReviewDependencies {
  /**
   * External task-system boundary used to fetch current incomplete tasks.
   */
  taskProvider: TaskProvider;
  /**
   * Model boundary used for bounded task selection and message generation.
   */
  modelProvider: ModelProvider;
  /**
   * Outbound message channel used to deliver the generated daily opener.
   */
  messageChannel: MessageChannel;
  /**
   * Persistence boundary used to load supporting state and inspect history.
   */
  stateStore: StateStore;
  /**
   * Run-status updater and idempotency guard for the current daily run.
   */
  runGuard: DailyRunGuard;
  /**
   * Persistence helper used to record selections and delivery outcomes consistently.
   */
  persistence: DailyReviewPersistence;
}

/**
 * Input passed to the high-level daily-review pipeline once the scheduler has acquired the run.
 */
export type RunDailyReviewInput = DailySchedulerHandlerInput;

/**
 * Manual trigger source supported by the daily-review pipeline outside the scheduler.
 */
export type ManualDailyReviewReason = "manual_reset";

/**
 * Input passed to the daily-review pipeline for an explicit manual trigger such as `/reset`.
 */
export interface ManualDailyReviewInput {
  /**
   * Stable conversation or user identifier that should receive the daily message.
   */
  conversationId: string;
  /**
   * User-local calendar date in `YYYY-MM-DD` form.
   */
  localDate: string;
  /**
   * Trigger source for the manual run.
   */
  reason: ManualDailyReviewReason;
  /**
   * Absolute timestamp when the manual trigger was received.
   */
  triggeredAt: string;
}

/**
 * Prepared internal daily-review input shared by scheduled and manual execution paths.
 */
export interface PreparedDailyReviewInput {
  /**
   * Persisted run record to update as work progresses.
   */
  run: DailyRunRecord;
  /**
   * Target conversation that should receive the generated daily message.
   */
  conversationId: string;
  /**
   * User-local calendar date in `YYYY-MM-DD` form.
   */
  localDate: string;
  /**
   * Absolute timestamp when the run was triggered.
   */
  triggeredAt: string;
}

/**
 * High-level outcome returned by the daily-review pipeline.
 */
export interface DailyReviewResult {
  /**
   * Final lifecycle status reached by the run.
   */
  status: "completed" | "delivery_failed";
}

/**
 * Optional runtime scaffolding returned when wiring the scheduler to the daily-review pipeline.
 */
export interface DailyReviewRuntime {
  /**
   * Scheduler responsible for firing the daily-review callback.
   */
  scheduler: Scheduler;
}
