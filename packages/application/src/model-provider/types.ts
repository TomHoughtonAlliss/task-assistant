import { z } from "zod";
import type {
  ConversationReply,
  Task,
  TaskSelection,
} from "@task-assistant/domain";
import {
  conversationReplySchema,
  taskSelectionSchema,
} from "@task-assistant/domain";
import type { RankingPayload } from "../task-selection/ranking-signals.js";
import { rankingPayloadSchema } from "../task-selection/ranking-signals.js";

/**
 * Stable identifier for a model-provider implementation.
 */
export const modelProviderNameSchema = z.enum(["openai"]);

/**
 * Stable identifier for a model-provider implementation.
 */
export type ModelProviderName = z.infer<typeof modelProviderNameSchema>;

/**
 * Classifies model-provider failures into application-relevant categories.
 */
export const modelProviderErrorCodeSchema = z.enum([
  "authentication_failed",
  "permission_denied",
  "rate_limited",
  "temporary_failure",
  "invalid_request",
  "invalid_response",
  "unsupported_operation",
  "unknown",
]);

/**
 * Classifies model-provider failures into application-relevant categories.
 */
export type ModelProviderErrorCode = z.infer<typeof modelProviderErrorCodeSchema>;

/**
 * Normalized model-provider failure surfaced to application use cases.
 */
export interface ModelProviderError {
  /**
   * Stable application-facing category for the failure.
   */
  code: ModelProviderErrorCode;
  /**
   * Human-readable failure message suitable for logs and debugging.
   */
  message: string;
  /**
   * Marks whether retrying the same request may succeed.
   */
  retriable: boolean;
  /**
   * Optional provider-owned debugging details retained at the infrastructure boundary.
   */
  details?: Record<string, string>;
}

/**
 * Explicit refusal result returned when the provider declines to produce a model output.
 */
export interface ModelProviderRefusal {
  /**
   * Stable application-facing refusal reason.
   */
  reason: string;
  /**
   * Optional provider-owned metadata preserved for logs.
   */
  details?: Record<string, string>;
}

/**
 * Success, refusal, or failure result returned from model-provider operations.
 */
export type ModelProviderResult<T> =
  | {
      ok: true;
      value: T;
    }
  | {
      ok: false;
      refusal: ModelProviderRefusal;
    }
  | {
      ok: false;
      error: ModelProviderError;
    };

/**
 * Structured model-generated daily opener delivered through the outbound message channel.
 */
export const dailyMessageSchema = z.object({
  body: z.string().min(1),
});

/**
 * Structured model-generated daily opener delivered through the outbound message channel.
 */
export type DailyMessage = z.infer<typeof dailyMessageSchema>;

/**
 * Input for the bounded daily-selection model call.
 */
export interface DailySelectionRequest {
  /**
   * Current user-local calendar date in `YYYY-MM-DD` format.
   */
  localDate: string;
  /**
   * Candidate tasks already filtered for eligibility.
   */
  candidateTasks: Task[];
  /**
   * Serializable deterministic ranking payload produced before model selection.
   */
  rankingPayload: RankingPayload;
}

/**
 * Input for the initial daily-message model call.
 */
export interface DailyMessageRequest {
  /**
   * Current user-local calendar date in `YYYY-MM-DD` format.
   */
  localDate: string;
  /**
   * Tasks that should be referenced by the model when composing the opener.
   */
  tasks: Task[];
}

/**
 * Input for the conversational reply model call.
 */
export interface ConversationReplyRequest {
  /**
   * Current user message to respond to.
   */
  userMessage: string;
  /**
   * Current conversation identifier used for state loading and logging.
   */
  conversationId: string;
  /**
   * Full current incomplete task list supplied as model grounding for this turn.
   */
  tasks: Task[];
  /**
   * Optional current task under discussion.
   */
  currentTask?: Task;
  /**
   * Optional small set of alternative tasks relevant to the current turn.
   */
  relevantTasks: Task[];
  /**
   * Optional bounded conversation summary supplied by the state store.
   */
  conversationSummary?: string;
}

/**
 * Shared application-facing interface for structured selection and reply generation.
 */
export interface ModelProvider {
  /**
   * Stable provider name used by runtime wiring and logs.
   */
  readonly name: ModelProviderName;
  /**
   * Produces a bounded daily task selection using the shared selection schema.
   */
  selectDailyTask(
    request: DailySelectionRequest,
  ): Promise<ModelProviderResult<TaskSelection>>;
  /**
   * Produces the initial friendly daily message using only the supplied tasks.
   */
  generateDailyMessage(
    request: DailyMessageRequest,
  ): Promise<ModelProviderResult<DailyMessage>>;
  /**
   * Produces a task-focused conversational reply using the shared reply schema.
   */
  generateConversationReply(
    request: ConversationReplyRequest,
  ): Promise<ModelProviderResult<ConversationReply>>;
}

/**
 * Shared structured-output schemas required at the model-provider boundary.
 */
export const modelProviderStructuredOutputs = {
  dailyMessage: dailyMessageSchema,
  taskSelection: taskSelectionSchema,
  conversationReply: conversationReplySchema,
  rankingPayload: rankingPayloadSchema,
} as const;
