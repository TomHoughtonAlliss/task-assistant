import type { DailyRunGuard } from "../daily-run-guard/daily-run-guard.js";
import type { DailyReviewPersistence } from "../daily-review-persistence/index.js";
import type { MessageChannel } from "../message-channel/index.js";
import type { ModelProvider } from "../model-provider/index.js";
import type { Scheduler } from "../scheduler/index.js";
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
