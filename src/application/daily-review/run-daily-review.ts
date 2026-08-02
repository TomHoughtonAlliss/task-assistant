import type { DailyReviewResult, DailyReviewDependencies, RunDailyReviewInput } from "./types.js";

/**
 * Orchestrates one complete daily-review run after the scheduler has already acquired the daily run.
 *
 * This is intentionally scaffold-level for now: it centralizes the interaction boundary between
 * task loading, filtering, ranking, model selection, message generation, delivery, and persistence,
 * without yet hard-wiring the unfinished business steps into one opaque method body.
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
   *
   * Planned steps:
   * 1. load tasks and supporting state
   * 2. filter and rank candidates
   * 3. ask the model to choose the bounded selection
   * 4. ask the model to generate the initial daily message
   * 5. deliver the message through the message channel
   * 6. persist the run, selection, and delivery outcome
   */
  public async run(_input: RunDailyReviewInput): Promise<DailyReviewResult> {
    void this.dependencies;

    throw new Error(
      "DailyReviewRunner.run is scaffolded but not implemented yet",
    );
  }
}
