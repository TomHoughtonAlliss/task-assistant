import { randomUUID } from "node:crypto";
import type {
  DailyReviewDependencies,
  DailyReviewResult,
  ManualDailyReviewInput,
  PreparedDailyReviewInput,
  RunDailyReviewInput,
} from "./types.js";
import type { DailyRunRecord } from "../state-store/index.js";

/**
 * Orchestrates one complete daily-review run after the scheduler has already acquired the daily run.
 */
export class DailyReviewRunner {
  private readonly dependencies: DailyReviewDependencies;

  /**
   * Creates the daily-review orchestration use case around the shared application boundaries.
   */
  public constructor(dependencies: DailyReviewDependencies) {
    this.dependencies = dependencies;
  }

  /**
   * Runs the end-to-end daily-review flow for one already-acquired daily run.
   */
  public async run(input: RunDailyReviewInput): Promise<DailyReviewResult> {
    return this.runPrepared({
      run: input.run,
      conversationId: input.run.userKey,
      localDate: input.localDate,
      triggeredAt: input.triggeredAt,
    });
  }

  /**
   * Runs one explicit manual daily review, bypassing scheduler acquisition.
   */
  public async runManual(
    input: ManualDailyReviewInput,
  ): Promise<DailyReviewResult> {
    const run = buildManualDailyRunRecord(input);
    this.dependencies.stateStore.saveDailyRun(run);

    try {
      return await this.runPrepared({
        run,
        conversationId: input.conversationId,
        localDate: input.localDate,
        triggeredAt: input.triggeredAt,
      });
    } catch (error: unknown) {
      this.dependencies.runGuard.updateStatus({
        run,
        status: "delivery_failed",
        now: input.triggeredAt,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Executes the shared task-fetch, message-generation, and delivery flow for one prepared run.
   */
  private async runPrepared(
    input: PreparedDailyReviewInput,
  ): Promise<DailyReviewResult> {
    const taskResult = await this.dependencies.taskProvider.listIncompleteTasks();
    if (!taskResult.ok) {
      throw new Error(`[${input.triggeredAt}] ${taskResult.error.message}`);
    }

    const messageResult = await this.dependencies.modelProvider.generateDailyMessage({
      tasks: taskResult.value,
      localDate: input.localDate,
    });
    if (!messageResult.ok) {
      if ("refusal" in messageResult) {
        throw new Error(`[${input.triggeredAt}] ${messageResult.refusal.reason}`);
      }

      throw new Error(`[${input.triggeredAt}] ${messageResult.error.message}`);
    }

    const deliveryResult = await this.dependencies.messageChannel.sendMessage({
      conversationId: input.conversationId,
      body: messageResult.value.body,
    });
    if (!deliveryResult.ok) {
      throw new Error(`[${input.triggeredAt}] ${deliveryResult.error.message}`);
    }

    this.dependencies.runGuard.updateStatus({
      run: input.run,
      status: "completed",
      now: deliveryResult.deliveredAt,
    });

    return {
      status: "completed",
    };
  }
}

/**
 * Builds the persisted daily-run record for one manual reset-triggered run.
 */
function buildManualDailyRunRecord(
  input: ManualDailyReviewInput,
): DailyRunRecord {
  const runId = randomUUID();

  return {
    id: runId,
    userKey: input.conversationId,
    runKey: `${input.conversationId}:${input.localDate}:${input.reason}:${runId}`,
    localDate: input.localDate,
    status: "reserved",
    startedAt: input.triggeredAt,
  };
}
