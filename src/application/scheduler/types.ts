import type { DailyRunRecord } from "../state-store/index.js";

/**
 * Replaceable runtime scheduler boundary.
 */
export interface Scheduler {
  /**
   * Starts scheduling future work and performs any immediate recovery checks.
   */
  start(): Promise<void>;
  /**
   * Stops future scheduling and clears any in-process timer.
   */
  stop(): void;
}

/**
 * Stable reason describing why the scheduler triggered the daily pipeline.
 */
export type DailySchedulerTriggerReason = "scheduled" | "missed_recovery";

/**
 * Input passed to the daily pipeline after the run guard has granted execution.
 */
export interface DailySchedulerHandlerInput {
  /**
   * Reserved run record that the pipeline should update as work progresses.
   */
  run: DailyRunRecord;
  /**
   * User-local calendar date the run belongs to.
   */
  localDate: string;
  /**
   * Reason the scheduler fired this run.
   */
  reason: DailySchedulerTriggerReason;
  /**
   * Absolute timestamp when this run was originally scheduled to fire.
   */
  scheduledFor: string;
  /**
   * Absolute timestamp when the scheduler actually triggered the handler.
   */
  triggeredAt: string;
}

/**
 * Async daily-pipeline callback invoked only after the idempotent run guard grants execution.
 */
export type DailySchedulerHandler = (
  input: DailySchedulerHandlerInput,
) => Promise<void>;

/**
 * Configuration for the in-process daily scheduler.
 */
export interface DailySchedulerConfig {
  /**
   * Stable user identifier used when deriving daily run keys.
   */
  userKey: string;
  /**
   * IANA timezone used for local-date and local-time calculations.
   */
  timezone: string;
  /**
   * Preferred local delivery time in `HH:MM` format.
   */
  localTime: string;
  /**
   * Maximum positive or negative daily jitter in minutes.
   */
  jitterMinutes: number;
  /**
   * Optional clock injection for tests.
   */
  now?: () => Date;
  /**
   * Optional timer factory for tests.
   */
  setTimeoutImplementation?: typeof setTimeout;
  /**
   * Optional timer clearer for tests.
   */
  clearTimeoutImplementation?: typeof clearTimeout;
}
