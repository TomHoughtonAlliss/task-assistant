import type {
  InboundMessage,
  MessageChannel,
  MessageChannelCommandResult,
  MessageDeliveryError,
  MessageDeliveryFailure,
  MessageDeliveryResult,
  OutboundMessage,
  SetMessageReactionInput,
} from "@task-assistant/application/message-channel";
import type { ConversationId } from "@task-assistant/domain";
import {
  telegramGetUpdatesResponseSchema,
  telegramUpdateSchema,
  telegramBooleanResponseSchema,
  telegramSendMessageResponseSchema,
  type TelegramGetUpdatesResponse,
  type TelegramSendMessageFailure,
  type TelegramUpdate,
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
 * Options for one Telegram polling read.
 */
export interface TelegramPollUpdatesOptions {
  /**
   * Optional update cursor; when supplied, only newer updates are returned.
   */
  offset?: number;
  /**
   * Optional maximum number of updates to request from Telegram.
   */
  limit?: number;
}

/**
 * Normalized result of one Telegram polling read.
 */
export interface TelegramPollUpdatesResult {
  /**
   * Successfully normalized inbound text messages.
   */
  messages: InboundMessage[];
  /**
   * Optional next update cursor to use on the next polling request.
   */
  nextOffset?: number;
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
   * Telegram supports outbound delivery plus both webhook and polling ingress modes.
   */
  public readonly capabilities = {
    sendMessage: true,
    indicateTyping: true,
    setMessageReaction: true,
    receiveViaWebhook: true,
    receiveViaPolling: true,
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
   * Broadcasts Telegram's short-lived typing indicator for the configured chat.
   */
  public async indicateTyping(
    conversationId: ConversationId,
  ): Promise<MessageChannelCommandResult> {
    if (conversationId !== this.chatId) {
      return {
        ok: false,
        error: buildDeliveryError(
          "invalid_message",
          "Typing conversation id does not match the configured Telegram chat",
          false,
          {
            expectedConversationId: this.chatId,
            conversationId,
          },
        ),
      };
    }

    return this.sendBooleanCommand(this.buildSendChatActionUrl(), {
      chat_id: coerceTelegramChatId(this.chatId),
      action: "typing",
    });
  }

  /**
   * Sets or clears an emoji reaction on an existing Telegram message.
   */
  public async setMessageReaction(
    input: SetMessageReactionInput,
  ): Promise<MessageChannelCommandResult> {
    if (input.conversationId !== this.chatId) {
      return {
        ok: false,
        error: buildDeliveryError(
          "invalid_message",
          "Reaction conversation id does not match the configured Telegram chat",
          false,
          {
            expectedConversationId: this.chatId,
            conversationId: input.conversationId,
          },
        ),
      };
    }

    return this.sendBooleanCommand(this.buildSetMessageReactionUrl(), {
      chat_id: coerceTelegramChatId(this.chatId),
      message_id: coerceTelegramMessageId(input.messageId),
      reaction:
        input.emoji === null
          ? []
          : [
              {
                type: "emoji",
                emoji: input.emoji,
              },
            ],
    });
  }

  /**
   * Parses one Telegram webhook payload into the normalized inbound-message shape.
   *
   * Returns `null` when the payload is valid Telegram data but not a supported plain-text message.
   * Throws when the payload does not match the expected Telegram update schema at all.
   */
  public parseWebhookUpdate(payload: unknown): InboundMessage | null {
    const update = telegramUpdateSchema.parse(payload);
    return normalizeTelegramUpdate(update);
  }

  /**
   * Polls Telegram for new updates and normalizes any supported inbound text messages.
   */
  public async pollUpdates(
    options: TelegramPollUpdatesOptions = {},
  ): Promise<TelegramPollUpdatesResult> {
    const response = await this.fetchImplementation(this.buildGetUpdatesUrl(), {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(buildGetUpdatesRequestBody(options)),
    });

    const responseText = await response.text();
    const parsedResponse = telegramGetUpdatesResponseSchema.safeParse(
      parseTelegramResponse(responseText),
    );

    if (!parsedResponse.success) {
      throw new Error(
        "Telegram returned a getUpdates response that did not match the expected Bot API schema",
      );
    }

    return mapGetUpdatesResponse(parsedResponse.data);
  }

  /**
   * Builds the Telegram Bot API URL for `sendMessage`.
   */
  private buildSendMessageUrl(): string {
    return `${this.apiBaseUrl}/bot${this.botToken}/sendMessage`;
  }

  /**
   * Builds the Telegram Bot API URL for `sendChatAction`.
   */
  private buildSendChatActionUrl(): string {
    return `${this.apiBaseUrl}/bot${this.botToken}/sendChatAction`;
  }

  /**
   * Builds the Telegram Bot API URL for `setMessageReaction`.
   */
  private buildSetMessageReactionUrl(): string {
    return `${this.apiBaseUrl}/bot${this.botToken}/setMessageReaction`;
  }

  /**
   * Builds the Telegram Bot API URL for `getUpdates`.
   */
  private buildGetUpdatesUrl(): string {
    return `${this.apiBaseUrl}/bot${this.botToken}/getUpdates`;
  }

  /**
   * Posts one Telegram Bot API command that returns a bare boolean result.
   */
  private async sendBooleanCommand(
    url: string,
    body: Record<string, unknown>,
  ): Promise<MessageChannelCommandResult> {
    try {
      const response = await this.fetchImplementation(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const responseText = await response.text();
      const parsedResponse = telegramBooleanResponseSchema.safeParse(
        parseTelegramResponse(responseText),
      );

      if (!parsedResponse.success) {
        return {
          ok: false,
          error: buildDeliveryError(
            "unknown",
            "Telegram returned a response that did not match the expected Bot API schema",
            false,
            {
              statusCode: String(response.status),
              body: responseText,
            },
          ),
        };
      }

      if (parsedResponse.data.ok) {
        return { ok: true };
      }

      return {
        ok: false,
        error: mapTelegramApiFailure(parsedResponse.data),
      };
    } catch (error: unknown) {
      return {
        ok: false,
        error: mapTransportFailure(error),
      };
    }
  }

  /**
   * Builds the JSON payload for one Telegram `sendMessage` request.
   */
  private buildRequestBody(message: OutboundMessage): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      chat_id: coerceTelegramChatId(this.chatId),
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
 * Creates a Telegram message-channel adapter from adapter configuration.
 */
export function createTelegramMessageChannel(
  config: TelegramMessageChannelConfig,
): TelegramMessageChannel {
  return new TelegramMessageChannel(config);
}

/**
 * Parses one Telegram response body as JSON while surfacing syntax failures as ordinary errors.
 */
function parseTelegramResponse(responseText: string): unknown {
  return JSON.parse(responseText);
}

/**
 * Maps one Telegram `getUpdates` response into normalized inbound messages and the next offset.
 */
function mapGetUpdatesResponse(
  response: TelegramGetUpdatesResponse,
): TelegramPollUpdatesResult {
  if (!response.ok) {
    throw new Error(response.description);
  }

  const messages: InboundMessage[] = [];
  let nextOffset: number | undefined;

  for (const update of response.result) {
    const normalizedMessage = normalizeTelegramUpdate(update);
    if (normalizedMessage) {
      messages.push(normalizedMessage);
    }

    nextOffset = update.update_id + 1;
  }

  const result: TelegramPollUpdatesResult = {
    messages,
  };

  if (nextOffset !== undefined) {
    result.nextOffset = nextOffset;
  }

  return result;
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
 * Normalizes one Telegram update into the shared inbound-message shape.
 *
 * Returns `null` for update types or message shapes the application does not currently support.
 */
function normalizeTelegramUpdate(update: TelegramUpdate): InboundMessage | null {
  const message = update.message ?? update.edited_message;
  if (!message || !message.text || !message.from) {
    return null;
  }

  const normalizedMessage: InboundMessage = {
    channel: "telegram",
    conversationId: String(message.chat.id),
    messageId: String(message.message_id),
    senderId: String(message.from.id),
    text: message.text,
    occurredAt: new Date(message.date * 1000).toISOString(),
  };

  if (message.reply_to_message) {
    normalizedMessage.sourceMessageId = String(message.reply_to_message.message_id);
  }

  return normalizedMessage;
}

/**
 * Builds one Telegram `getUpdates` request body.
 */
function buildGetUpdatesRequestBody(
  options: TelegramPollUpdatesOptions,
): Record<string, number> {
  const payload: Record<string, number> = {};

  if (options.offset !== undefined) {
    payload.offset = options.offset;
  }

  if (options.limit !== undefined) {
    payload.limit = options.limit;
  }

  return payload;
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
 * Converts an application-level chat identifier into the numeric-or-string shape Telegram accepts.
 */
function coerceTelegramChatId(chatId: string): number | string {
  const numericChatId = Number(chatId);
  return Number.isInteger(numericChatId) ? numericChatId : chatId;
}

/**
 * Converts an application-level message identifier into the numeric-or-string shape Telegram accepts.
 */
function coerceTelegramMessageId(messageId: string): number | string {
  const numericMessageId = Number(messageId);
  return Number.isInteger(numericMessageId) ? numericMessageId : messageId;
}
