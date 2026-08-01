import type { StateStore } from "../state-store/index.js";
import type {
  AcquireDailyRunInput,
  DailyRunGuardResult,
  UpdateDailyRunStatusInput,
} from "./types.js";

/**
 * Creates deterministic run keys and reserves daily work so duplicate triggers can be short-circuited safely.
 */
export class DailyRunGuard {
  private readonly stateStore: StateStore;

  /**
   * Creates a daily-run guard backed by the shared state-store boundary.
   */
  public constructor(stateStore: StateStore) {
    this.stateStore = stateStore;
  }

  /**
   * Attempts to acquire the daily run for one user and local date.
   */
  public acquire(input: AcquireDailyRunInput): DailyRunGuardResult {
    const run = {
      id: input.runId,
      userKey: input.userKey,
      runKey: createDailyRunKey(input.userKey, input.localDate),
      localDate: input.localDate,
      status: "reserved" as const,
      startedAt: input.now,
    };
    const reservation = this.stateStore.reserveDailyRun(run);

    switch (reservation.status) {
      case "reserved":
        return {
          decision: "acquired",
          run: reservation.record,
        };
      case "already_succeeded":
        return {
          decision: "already_succeeded",
          run: reservation.record,
        };
      case "already_in_progress":
        return {
          decision: "already_in_progress",
          run: reservation.record,
        };
    }
  }

  /**
   * Persists a new lifecycle status for a run after work progresses.
   */
  public updateStatus(input: UpdateDailyRunStatusInput): void {
    const updatedRun = {
      ...input.run,
      status: input.status,
    };

    if (isTerminalDailyRunStatus(input.status)) {
      updatedRun.completedAt = input.now;
    } else {
      delete updatedRun.completedAt;
    }

    if (input.errorMessage) {
      updatedRun.lastErrorMessage = input.errorMessage;
    } else {
      delete updatedRun.lastErrorMessage;
    }

    this.stateStore.saveDailyRun(updatedRun);
  }
}

/**
 * Derives the stable daily run key from one user and one local calendar date.
 */
export function createDailyRunKey(userKey: string, localDate: string): string {
  return `${userKey}:${localDate}`;
}

/**
 * Returns whether the daily run status should be treated as terminal for the current day.
 */
function isTerminalDailyRunStatus(status: UpdateDailyRunStatusInput["status"]): boolean {
  return (
    status === "delivery_succeeded" ||
    status === "delivery_failed" ||
    status === "completed"
  );
}
