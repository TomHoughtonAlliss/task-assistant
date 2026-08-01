import type { AppConfig } from "../../../app/config.js";
import type {
  MessageChannel,
  MessageDeliveryError,
  MessageDeliveryFailure,
  MessageDeliveryResult,
  OutboundMessage,
} from "../../../application/message-channel/index.js";
import {
  telegramSendMessageResponseSchema,
  type TelegramSendMessageFailure,
} from "./types.js";

/**
 * Configuration required by the Telegram outbound message-channel adapter.
 */
export interface TelegramMessageChannelConfig {
  /**
   * Telegram bot token used to authenticate Bot API requests.
   */
  botToken: string;
  /**
   * Stable chat identifier allowed for outbound delivery.
   */
  chatId: string;
  /**
   * Base URL for the Telegram Bot API.
   */
  apiBaseUrl: string;
  /**
   * Optional fetch implementation for tests or alternate runtimes.
   */
  fetchImplementation?: typeof fetch;
}

/**
 * Telegram-backed outbound message-channel adapter.
 */
export class TelegramMessageChannel implements MessageChannel {
  /**
   * Stable provider name used by runtime wiring and persistence.
   */
  public readonly name = "telegram" as const;

  /**
   * Telegram supports outbound delivery now; inbound modes are added in later tasks.
   */
  public readonly capabilities = {
    sendMessage: true,
    receiveViaWebhook: false,
    receiveViaPolling: false,
  } as const;

  private readonly botToken: string;
  private readonly chatId: string;
  private readonly apiBaseUrl: string;
  private readonly fetchImplementation: typeof fetch;

  /**
   * Creates a Telegram outbound adapter from validated runtime configuration.
   */
  public constructor(config: TelegramMessageChannelConfig) {
    this.botToken = config.botToken;
    this.chatId = config.chatId;
    this.apiBaseUrl = config.apiBaseUrl.replace(/\/+$/u, "");
    this.fetchImplementation = config.fetchImplementation ?? fetch;
  }

  /**
   * Sends one outbound message to the configured Telegram chat and normalizes the delivery result.
   */
  public async sendMessage(message: OutboundMessage): Promise<MessageDeliveryResult> {
    const attemptedAt = new Date().toISOString();

    if (message.conversationId !== this.chatId) {
      return buildFailureResult(
        attemptedAt,
        message.conversationId,
        buildDeliveryError(
          "invalid_message",
          "Outbound conversation id does not match the configured Telegram chat",
          false,
          {
            expectedConversationId: this.chatId,
            conversationId: message.conversationId,
          },
        ),
      );
    }

    try {
      const response = await this.fetchImplementation(this.buildSendMessageUrl(), {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(this.buildRequestBody(message)),
      });

      const responseText = await response.text();
      const parsedResponse = telegramSendMessageResponseSchema.safeParse(
        parseTelegramResponse(responseText),
      );

      if (!parsedResponse.success) {
        return buildFailureResult(
          attemptedAt,
          message.conversationId,
          buildDeliveryError(
            "unknown",
            "Telegram returned a response that did not match the expected Bot API schema",
            false,
            {
              statusCode: String(response.status),
              body: responseText,
            },
          ),
        );
      }

      if (parsedResponse.data.ok) {
        return {
          ok: true,
          channel: this.name,
          conversationId: String(parsedResponse.data.result.chat.id),
          messageId: String(parsedResponse.data.result.message_id),
          deliveredAt: new Date(parsedResponse.data.result.date * 1000).toISOString(),
        };
      }

      return buildFailureResult(
        attemptedAt,
        message.conversationId,
        mapTelegramApiFailure(parsedResponse.data),
      );
    } catch (error: unknown) {
      return buildFailureResult(
        attemptedAt,
        message.conversationId,
        mapTransportFailure(error),
      );
    }
  }

  /**
   * Builds the Telegram Bot API URL for `sendMessage`.
   */
  private buildSendMessageUrl(): string {
    return `${this.apiBaseUrl}/bot${this.botToken}/sendMessage`;
  }

  /**
   * Builds the JSON payload for one Telegram `sendMessage` request.
   */
  private buildRequestBody(message: OutboundMessage): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      chat_id: this.chatId,
      text: message.body,
    };

    if (message.replyToMessageId) {
      payload.reply_parameters = {
        message_id: coerceTelegramMessageId(message.replyToMessageId),
      };
    }

    return payload;
  }
}

/**
 * Creates a Telegram message-channel adapter from validated runtime configuration.
 */
export function createTelegramMessageChannel(
  config: AppConfig,
): TelegramMessageChannel {
  return new TelegramMessageChannel({
    botToken: config.integrations.telegram.botToken,
    chatId: config.integrations.telegram.chatId,
    apiBaseUrl: config.integrations.telegram.apiBaseUrl,
  });
}

/**
 * Parses one Telegram response body as JSON while surfacing syntax failures as ordinary errors.
 */
function parseTelegramResponse(responseText: string): unknown {
  return JSON.parse(responseText);
}

/**
 * Maps one Telegram Bot API failure payload into the normalized delivery-error shape.
 */
function mapTelegramApiFailure(
  failure: TelegramSendMessageFailure,
): MessageDeliveryError {
  if (failure.error_code === 400) {
    return buildDeliveryError(
      "invalid_message",
      failure.description,
      false,
      collectTelegramFailureDetails(failure),
    );
  }

  if (failure.error_code === 401) {
    return buildDeliveryError(
      "authentication_failed",
      failure.description,
      false,
      collectTelegramFailureDetails(failure),
    );
  }

  if (failure.error_code === 403) {
    return buildDeliveryError(
      "permission_denied",
      failure.description,
      false,
      collectTelegramFailureDetails(failure),
    );
  }

  if (failure.error_code === 429) {
    return buildDeliveryError(
      "rate_limited",
      failure.description,
      true,
      collectTelegramFailureDetails(failure),
    );
  }

  if (failure.error_code >= 500) {
    return buildDeliveryError(
      "temporary_failure",
      failure.description,
      true,
      collectTelegramFailureDetails(failure),
    );
  }

  return buildDeliveryError(
    "unknown",
    failure.description,
    false,
    collectTelegramFailureDetails(failure),
  );
}

/**
 * Maps one transport-level fetch failure into the normalized delivery-error shape.
 */
function mapTransportFailure(error: unknown): MessageDeliveryError {
  if (error instanceof Error) {
    return buildDeliveryError("temporary_failure", error.message, true);
  }

  return buildDeliveryError(
    "temporary_failure",
    "Telegram delivery failed before a response was received",
    true,
  );
}

/**
 * Collects small structured debugging details from one Telegram failure payload.
 */
function collectTelegramFailureDetails(
  failure: TelegramSendMessageFailure,
): Record<string, string> {
  const details: Record<string, string> = {
    errorCode: String(failure.error_code),
  };

  if (failure.parameters?.retry_after) {
    details.retryAfterSeconds = String(failure.parameters.retry_after);
  }

  return details;
}

/**
 * Builds one normalized message-delivery failure result.
 */
function buildFailureResult(
  attemptedAt: string,
  conversationId: string,
  error: MessageDeliveryError,
): MessageDeliveryFailure {
  return {
    ok: false,
    channel: "telegram",
    conversationId,
    attemptedAt,
    error,
  };
}

/**
 * Builds one normalized delivery error while omitting empty optional details.
 */
function buildDeliveryError(
  code: MessageDeliveryError["code"],
  message: string,
  retriable: boolean,
  details?: Record<string, string>,
): MessageDeliveryError {
  const error: MessageDeliveryError = {
    code,
    message,
    retriable,
  };

  if (details && Object.keys(details).length > 0) {
    error.details = details;
  }

  return error;
}

/**
 * Converts an application-level message identifier into the numeric-or-string shape Telegram accepts.
 */
function coerceTelegramMessageId(messageId: string): number | string {
  const numericMessageId = Number(messageId);
  return Number.isInteger(numericMessageId) ? numericMessageId : messageId;
}
