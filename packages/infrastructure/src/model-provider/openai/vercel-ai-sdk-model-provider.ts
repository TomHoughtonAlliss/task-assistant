import { createOpenAI } from "@ai-sdk/openai";
import { generateText, NoObjectGeneratedError, Output } from "ai";
import type {
  ConversationReplyRequest,
  DailyMessage,
  DailyMessageRequest,
  DailySelectionRequest,
  ModelProvider,
  ModelProviderError,
  ModelProviderResult,
} from "@task-assistant/application/model-provider";
import { modelProviderStructuredOutputs } from "@task-assistant/application/model-provider";
import type { ConversationReply, TaskSelection } from "@task-assistant/domain";
import {
  buildConversationReplyPrompt,
  buildConversationReplySystemPrompt,
  buildDailyMessagePrompt,
  buildDailyMessageSystemPrompt,
  buildDailySelectionPrompt,
  buildDailySelectionSystemPrompt,
} from "./prompt-builders.js";

/**
 * Configuration required by the OpenAI-backed Vercel AI SDK model adapter.
 */
export interface OpenAiModelProviderConfig {
  /**
   * API key used to authenticate OpenAI requests.
   */
  apiKey: string;
  /**
   * Base URL for the OpenAI-compatible endpoint.
   */
  baseUrl: string;
  /**
   * Language-model identifier used for structured generation calls.
   */
  model: string;
  /**
   * Shared tone-of-voice instruction appended to all model-facing system prompts.
   */
  toneOfVoicePrompt: string;
}

/**
 * Shared model-provider adapter implemented with Vercel AI SDK and the OpenAI provider package.
 */
export class VercelAiSdkOpenAiModelProvider implements ModelProvider {
  /**
   * Stable provider name used by runtime wiring and logs.
   */
  public readonly name = "openai" as const;

  private readonly modelFactory;
  private readonly modelId: string;
  private readonly toneOfVoicePrompt: string;

  /**
   * Creates an OpenAI-backed Vercel AI SDK adapter for structured selection and reply generation.
   */
  public constructor(config: OpenAiModelProviderConfig) {
    this.modelFactory = createOpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
    });
    this.modelId = config.model;
    this.toneOfVoicePrompt = config.toneOfVoicePrompt;
  }

  /**
   * Produces a bounded daily selection using the shared task-selection schema.
   */
  public async selectDailyTask(
    request: DailySelectionRequest,
  ): Promise<ModelProviderResult<TaskSelection>> {
    try {
      const result = await generateText({
        model: this.modelFactory(this.modelId),
        output: Output.object({
          schema: modelProviderStructuredOutputs.taskSelection,
          name: "daily_task_selection",
        }),
        system: buildDailySelectionSystemPrompt(this.toneOfVoicePrompt),
        prompt: buildDailySelectionPrompt(request),
      });

      return {
        ok: true,
        value: result.output,
      };
    } catch (error: unknown) {
      return mapModelProviderFailure(error);
    }
  }

  /**
   * Produces the initial friendly daily message using the shared daily-message schema.
   */
  public async generateDailyMessage(
    request: DailyMessageRequest,
  ): Promise<ModelProviderResult<DailyMessage>> {
    try {
      const result = await generateText({
        model: this.modelFactory(this.modelId),
        output: Output.object({
          schema: modelProviderStructuredOutputs.dailyMessage,
          name: "daily_message",
        }),
        system: buildDailyMessageSystemPrompt(this.toneOfVoicePrompt),
        prompt: buildDailyMessagePrompt(request),
      });

      return {
        ok: true,
        value: result.output,
      };
    } catch (error: unknown) {
      return mapModelProviderFailure(error);
    }
  }

  /**
   * Produces a task-focused conversational reply using the shared reply schema.
   */
  public async generateConversationReply(
    request: ConversationReplyRequest,
  ): Promise<ModelProviderResult<ConversationReply>> {
    try {
      const result = await generateText({
        model: this.modelFactory(this.modelId),
        output: Output.object({
          schema: modelProviderStructuredOutputs.conversationReply,
          name: "task_conversation_reply",
        }),
        system: buildConversationReplySystemPrompt(this.toneOfVoicePrompt),
        prompt: buildConversationReplyPrompt(request),
      });

      return {
        ok: true,
        value: modelProviderStructuredOutputs.conversationReply.parse(
          result.output,
        ),
      };
    } catch (error: unknown) {
      return mapModelProviderFailure(error);
    }
  }
}

/**
 * Creates the OpenAI-backed Vercel AI SDK model provider from adapter configuration.
 */
export function createOpenAiModelProvider(
  config: OpenAiModelProviderConfig,
): VercelAiSdkOpenAiModelProvider {
  return new VercelAiSdkOpenAiModelProvider(config);
}

/**
 * Converts AI SDK and provider failures into the normalized application result shape.
 */
function mapModelProviderFailure(
  error: unknown,
): ModelProviderResult<never> {
  const refusalReason = extractRefusalReason(error);

  if (refusalReason) {
    return {
      ok: false,
      refusal: {
        reason: refusalReason,
      },
    };
  }

  return {
    ok: false,
    error: toModelProviderError(error),
  };
}

/**
 * Attempts to extract an explicit provider refusal message from an unknown error.
 */
function extractRefusalReason(error: unknown): string | null {
  if (NoObjectGeneratedError.isInstance(error)) {
    const text = error.text;
    if (text && /refus/i.test(text)) {
      return text;
    }
  }

  if (!isRecord(error)) {
    return null;
  }

  const text = readString(error, "text");
  if (text && /refus/i.test(text)) {
    return text;
  }

  const cause = readRecord(error, "cause");
  if (cause) {
    const causeMessage = readString(cause, "message");
    if (causeMessage && /refus/i.test(causeMessage)) {
      return causeMessage;
    }
  }

  return null;
}

/**
 * Converts an unknown SDK or provider error into the normalized model-provider error shape.
 */
function toModelProviderError(error: unknown): ModelProviderError {
  if (NoObjectGeneratedError.isInstance(error)) {
    const details = error.text ? { text: error.text } : undefined;

    return buildModelProviderError(
      "invalid_response",
      error.message,
      false,
      details,
    );
  }

  if (isRecord(error)) {
    const message = readString(error, "message");
    const statusCode = readNumber(error, "statusCode");
    const details = collectErrorDetails(error);

    if (statusCode === 400) {
      return buildModelProviderError(
        "invalid_request",
        message ?? "Invalid model-provider request",
        false,
        details,
      );
    }

    if (statusCode === 401) {
      return buildModelProviderError(
        "authentication_failed",
        message ?? "Model-provider authentication failed",
        false,
        details,
      );
    }

    if (statusCode === 403) {
      return buildModelProviderError(
        "permission_denied",
        message ?? "Model-provider permission denied",
        false,
        details,
      );
    }

    if (statusCode === 429) {
      return buildModelProviderError(
        "rate_limited",
        message ?? "Model-provider rate limited",
        true,
        details,
      );
    }

    if (typeof statusCode === "number" && statusCode >= 500) {
      return buildModelProviderError(
        "temporary_failure",
        message ?? "Temporary model-provider failure",
        true,
        details,
      );
    }

    if (message && /NoObjectGeneratedError|schema|validation/i.test(message)) {
      return buildModelProviderError(
        "invalid_response",
        message,
        false,
        details,
      );
    }

    if (message) {
      return buildModelProviderError("unknown", message, false, details);
    }
  }

  if (error instanceof Error) {
    return buildModelProviderError("unknown", error.message, false);
  }

  return buildModelProviderError(
    "unknown",
    "Unknown model-provider failure",
    false,
  );
}

/**
 * Creates one normalized model-provider error while omitting empty optional details.
 */
function buildModelProviderError(
  code: ModelProviderError["code"],
  message: string,
  retriable: boolean,
  details?: Record<string, string>,
): ModelProviderError {
  const normalizedError: ModelProviderError = {
    code,
    message,
    retriable,
  };

  if (details && Object.keys(details).length > 0) {
    normalizedError.details = details;
  }

  return normalizedError;
}

/**
 * Collects stringified debugging details from an unknown error object.
 */
function collectErrorDetails(error: Record<string, unknown>): Record<string, string> {
  const details: Record<string, string> = {};

  for (const [key, value] of Object.entries(error)) {
    if (key === "message" || key === "stack") {
      continue;
    }

    if (typeof value === "string") {
      details[key] = value;
      continue;
    }

    if (typeof value === "number" || typeof value === "boolean") {
      details[key] = String(value);
      continue;
    }

    if (value !== undefined) {
      details[key] = JSON.stringify(value);
    }
  }

  return details;
}

/**
 * Returns whether an unknown value is a string-keyed record.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Reads one string property from a string-keyed record.
 */
function readString(
  value: Record<string, unknown>,
  key: string,
): string | undefined {
  const candidate = value[key];
  return typeof candidate === "string" ? candidate : undefined;
}

/**
 * Reads one numeric property from a string-keyed record.
 */
function readNumber(
  value: Record<string, unknown>,
  key: string,
): number | undefined {
  const candidate = value[key];
  return typeof candidate === "number" ? candidate : undefined;
}

/**
 * Reads one record property from a string-keyed record.
 */
function readRecord(
  value: Record<string, unknown>,
  key: string,
): Record<string, unknown> | undefined {
  const candidate = value[key];
  return isRecord(candidate) ? candidate : undefined;
}
