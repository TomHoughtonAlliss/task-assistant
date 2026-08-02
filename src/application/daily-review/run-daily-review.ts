import type { DailyReviewResult, DailyReviewDependencies, RunDailyReviewInput } from "./types.js";

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
    const now = input.triggeredAt;
    const taskResult = await this.dependencies.taskProvider.listIncompleteTasks();
    if (!taskResult.ok) {
      throw new Error(`[${now}] ${taskResult.error.message}`);
    }
    const tasks = taskResult.value;

    const messageResult = await this.dependencies.modelProvider.generateDailyMessage({
      tasks,
      localDate: input.localDate,
    });
    if (!messageResult.ok) {
      if ("refusal" in messageResult) {
        throw new Error(`[${now}] ${messageResult.refusal.reason}`);
      } else {
        throw new Error(`[${now}] ${messageResult.error.message}`);
      }
    }
    const message = messageResult.value.body;

    const result = await this.dependencies.messageChannel.sendMessage({
      conversationId: input.run.userKey,
      body: message,
    });

    if (!result.ok) {
      throw new Error(`[${now}] ${result.error.message}`);
    }

    return {
      status: "completed",
    };
  }
}
