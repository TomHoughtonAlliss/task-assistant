import { z } from "zod";
import type {
  ModelProvider,
  ModelProviderError,
  ModelProviderRefusal,
} from "../model-provider/index.js";
import type { RankingPayload } from "./ranking-signals.js";
import type { Task, TaskId, TaskSelection } from "../../domain/index.js";

/**
 * Input required to perform the bounded final daily-task selection.
 */
export interface SelectFinalTaskInput {
  /**
   * Current user-local calendar date in `YYYY-MM-DD` format.
   */
  localDate: string;
  /**
   * Candidate tasks that remain eligible after filtering.
   */
  candidateTasks: Task[];
  /**
   * Deterministic ranking payload prepared before the model call.
   */
  rankingPayload: RankingPayload;
  /**
   * Structured model-provider boundary used to produce the final selection.
   */
  modelProvider: ModelProvider;
}

/**
 * Stable application-facing category for final-selection failures.
 */
export const finalTaskSelectionErrorCodeSchema = z.enum([
  "no_candidates",
  "ranking_payload_mismatch",
  "model_provider_failed",
  "invalid_selection",
]);

/**
 * Stable application-facing category for final-selection failures.
 */
export type FinalTaskSelectionErrorCode = z.infer<
  typeof finalTaskSelectionErrorCodeSchema
>;

/**
 * Normalized failure surfaced by the final-selection use case.
 */
export interface FinalTaskSelectionError {
  /**
   * Stable category for the failure.
   */
  code: FinalTaskSelectionErrorCode;
  /**
   * Human-readable explanation suitable for logs and debugging.
   */
  message: string;
  /**
   * Marks whether retrying the same request may succeed.
   */
  retriable: boolean;
  /**
   * Optional structured details preserved for debugging.
   */
  details?: Record<string, string>;
  /**
   * Optional underlying model-provider error when the failure happened at that boundary.
   */
  cause?: ModelProviderError;
}

/**
 * Success, refusal, or failure result returned from final task selection.
 */
export type FinalTaskSelectionResult =
  | {
      ok: true;
      value: TaskSelection;
    }
  | {
      ok: false;
      refusal: ModelProviderRefusal;
    }
  | {
      ok: false;
      error: FinalTaskSelectionError;
    };

/**
 * Uses the shared model-provider boundary to choose one valid final daily selection.
 *
 * Failure modes:
 * - returns `no_candidates` when no eligible tasks were supplied;
 * - returns `ranking_payload_mismatch` when the deterministic payload does not line up with the candidates;
 * - forwards explicit model refusals unchanged;
 * - maps model-provider failures into `model_provider_failed`;
 * - returns `invalid_selection` when the model references tasks outside the candidate set or repeats invalid IDs.
 */
export async function selectFinalTask(
  input: SelectFinalTaskInput,
): Promise<FinalTaskSelectionResult> {
  if (input.candidateTasks.length === 0) {
    return {
      ok: false,
      error: {
        code: "no_candidates",
        message: "At least one eligible candidate task is required for final selection",
        retriable: false,
      },
    };
  }

  const rankingPayloadValidationError = validateRankingPayload(
    input.candidateTasks,
    input.rankingPayload,
  );
  if (rankingPayloadValidationError) {
    return {
      ok: false,
      error: rankingPayloadValidationError,
    };
  }

  const modelResult = await input.modelProvider.selectDailyTask({
    localDate: input.localDate,
    candidateTasks: input.candidateTasks,
    rankingPayload: input.rankingPayload,
  });

  if (!modelResult.ok) {
    if ("refusal" in modelResult) {
      return {
        ok: false,
        refusal: modelResult.refusal,
      };
    }

    const error: FinalTaskSelectionError = {
      code: "model_provider_failed",
      message: modelResult.error.message,
      retriable: modelResult.error.retriable,
      cause: modelResult.error,
    };
    if (modelResult.error.details) {
      error.details = modelResult.error.details;
    }

    return {
      ok: false,
      error,
    };
  }

  const selectionValidation = validateSelectionAgainstCandidates(
    modelResult.value,
    input.candidateTasks,
  );
  if (selectionValidation) {
    return {
      ok: false,
      error: selectionValidation,
    };
  }

  return {
    ok: true,
    value: modelResult.value,
  };
}

/**
 * Confirms that the deterministic ranking payload is internally consistent with the candidate set.
 */
function validateRankingPayload(
  candidateTasks: Task[],
  rankingPayload: RankingPayload,
): FinalTaskSelectionError | null {
  const candidateIds = buildTaskIdSet(candidateTasks);
  const payloadTaskIds = new Set<TaskId>();

  for (const entry of rankingPayload.entries) {
    if (entry.task.id !== entry.signals.taskId) {
      return {
        code: "ranking_payload_mismatch",
        message: "Ranking payload entry task id must match its deterministic signals task id",
        retriable: false,
        details: {
          taskId: entry.task.id,
          signalTaskId: entry.signals.taskId,
        },
      };
    }

    if (!candidateIds.has(entry.task.id)) {
      return {
        code: "ranking_payload_mismatch",
        message: "Ranking payload contains a task outside the supplied candidate set",
        retriable: false,
        details: {
          taskId: entry.task.id,
        },
      };
    }

    if (payloadTaskIds.has(entry.task.id)) {
      return {
        code: "ranking_payload_mismatch",
        message: "Ranking payload contains duplicate task identifiers",
        retriable: false,
        details: {
          taskId: entry.task.id,
        },
      };
    }

    payloadTaskIds.add(entry.task.id);
  }

  for (const candidateTask of candidateTasks) {
    if (!payloadTaskIds.has(candidateTask.id)) {
      return {
        code: "ranking_payload_mismatch",
        message: "Ranking payload must contain one entry for every candidate task",
        retriable: false,
        details: {
          taskId: candidateTask.id,
        },
      };
    }
  }

  return null;
}

/**
 * Validates that the returned selection references only the supplied candidate tasks.
 */
function validateSelectionAgainstCandidates(
  selection: TaskSelection,
  candidateTasks: Task[],
): FinalTaskSelectionError | null {
  const candidateIds = buildTaskIdSet(candidateTasks);

  if (!candidateIds.has(selection.mainTaskId)) {
    return {
      code: "invalid_selection",
      message: "Model selected a main task that was not part of the candidate set",
      retriable: false,
      details: {
        taskId: selection.mainTaskId,
      },
    };
  }

  const seenAdditionalIds = new Set<TaskId>();
  for (const taskId of selection.additionalTaskIds) {
    if (!candidateIds.has(taskId)) {
      return {
        code: "invalid_selection",
        message: "Model selected an additional task that was not part of the candidate set",
        retriable: false,
        details: {
          taskId,
        },
      };
    }

    if (taskId === selection.mainTaskId) {
      return {
        code: "invalid_selection",
        message: "Model selected the same task as both the main task and an additional task",
        retriable: false,
        details: {
          taskId,
        },
      };
    }

    if (seenAdditionalIds.has(taskId)) {
      return {
        code: "invalid_selection",
        message: "Model selected the same additional task more than once",
        retriable: false,
        details: {
          taskId,
        },
      };
    }

    seenAdditionalIds.add(taskId);
  }

  return null;
}

/**
 * Builds one stable lookup set for task identifiers.
 */
function buildTaskIdSet(tasks: Task[]): ReadonlySet<TaskId> {
  return new Set(tasks.map((task) => task.id));
}
