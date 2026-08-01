import type {
  DailyRunRecord,
  DailyRunStatus,
} from "../state-store/index.js";

/**
 * Application-facing outcome when attempting to acquire a daily run for work.
 */
export type DailyRunGuardDecision =
  | "acquired"
  | "already_succeeded"
  | "already_in_progress";

/**
 * Result returned by the daily-run idempotency guard.
 */
export interface DailyRunGuardResult {
  /**
   * Whether the caller may proceed with work for the requested user and date.
   */
  decision: DailyRunGuardDecision;
  /**
   * Current persisted run record after the guard decision.
   */
  run: DailyRunRecord;
}

/**
 * Input required to derive and reserve a daily run key.
 */
export interface AcquireDailyRunInput {
  /**
   * Stable user identifier used in the unique run key.
   */
  userKey: string;
  /**
   * User-local calendar date in `YYYY-MM-DD` form.
   */
  localDate: string;
  /**
   * Current timestamp for the reservation attempt.
   */
  now: string;
  /**
   * Stable identifier to use when creating a new daily run record.
   */
  runId: string;
}

/**
 * Input used when updating a reserved daily run after work progresses.
 */
export interface UpdateDailyRunStatusInput {
  /**
   * Existing daily run record to update.
   */
  run: DailyRunRecord;
  /**
   * New lifecycle status for the run.
   */
  status: DailyRunStatus;
  /**
   * Current timestamp for the update.
   */
  now: string;
  /**
   * Optional error message to persist when the run failed.
   */
  errorMessage?: string;
}
