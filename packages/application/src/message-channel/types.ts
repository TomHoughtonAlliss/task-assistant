import { z } from "zod";
import type { ConversationId, MessageId } from "@task-assistant/domain";

/**
 * Stable identifier for a message channel implementation.
 */
export const messageChannelNameSchema = z.enum(["telegram"]);

/**
 * Stable identifier for a message channel implementation.
 */
export type MessageChannelName = z.infer<typeof messageChannelNameSchema>;

/**
 * Delivery or receive capability supported by a message channel implementation.
 */
export interface MessageChannelCapabilities {
  /**
   * Channel can send outbound messages.
   */
  sendMessage: true;
  /**
   * Channel can broadcast a short-lived typing/activity indicator.
   */
  indicateTyping: boolean;
  /**
   * Channel can set or clear an emoji reaction on an existing message.
   */
  setMessageReaction: boolean;
  /**
   * Channel can accept webhook-driven inbound messages.
   */
  receiveViaWebhook: boolean;
  /**
   * Channel can accept polling-driven inbound messages.
   */
  receiveViaPolling: boolean;
}

/**
 * Channel-agnostic payload for one outbound message.
 */
export interface OutboundMessage {
  /**
   * Stable conversation identifier inside the message channel.
   */
  conversationId: ConversationId;
  /**
   * User-facing message body to deliver.
   */
  body: string;
  /**
   * Optional source message to reply to when the channel supports threaded replies.
   */
  replyToMessageId?: MessageId;
}

/**
 * Channel-agnostic payload for one inbound user message.
 */
export interface InboundMessage {
  /**
   * Stable channel name that produced the message.
   */
  channel: MessageChannelName;
  /**
   * Stable conversation identifier inside the message channel.
   */
  conversationId: ConversationId;
  /**
   * Stable channel message identifier.
   */
  messageId: MessageId;
  /**
   * Optional channel message identifier being replied to.
   */
  sourceMessageId?: MessageId;
  /**
   * Stable sender identifier as represented by the channel.
   */
  senderId: string;
  /**
   * Plain-text message body after channel-specific parsing.
   */
  text: string;
  /**
   * Timestamp when the message was received by the channel.
   */
  occurredAt: string;
}

/**
 * Classifies message delivery failures into application-relevant categories.
 */
export const messageDeliveryErrorCodeSchema = z.enum([
  "authentication_failed",
  "permission_denied",
  "rate_limited",
  "temporary_failure",
  "invalid_message",
  "unsupported_operation",
  "unknown",
]);

/**
 * Classifies message delivery failures into application-relevant categories.
 */
export type MessageDeliveryErrorCode = z.infer<
  typeof messageDeliveryErrorCodeSchema
>;

/**
 * Normalized channel delivery failure used by retry and persistence logic.
 */
export interface MessageDeliveryError {
  /**
   * Stable application-facing error category.
   */
  code: MessageDeliveryErrorCode;
  /**
   * Human-readable failure message suitable for logs.
   */
  message: string;
  /**
   * Marks whether retrying the same outbound message may succeed.
   */
  retriable: boolean;
  /**
   * Optional provider-owned debugging details preserved at the infrastructure boundary.
   */
  details?: Record<string, string>;
}

/**
 * Successful outbound delivery result returned by a message channel implementation.
 */
export interface MessageDeliverySuccess {
  /**
   * Indicates that delivery succeeded.
   */
  ok: true;
  /**
   * Stable channel name that delivered the message.
   */
  channel: MessageChannelName;
  /**
   * Stable channel conversation identifier that received the message.
   */
  conversationId: ConversationId;
  /**
   * Stable channel message identifier assigned to the outbound message.
   */
  messageId: MessageId;
  /**
   * Timestamp when the delivery succeeded.
   */
  deliveredAt: string;
}

/**
 * Failed outbound delivery result returned by a message channel implementation.
 */
export interface MessageDeliveryFailure {
  /**
   * Indicates that delivery failed.
   */
  ok: false;
  /**
   * Stable channel name that attempted the delivery.
   */
  channel: MessageChannelName;
  /**
   * Optional conversation identifier when the channel could resolve one before failure.
   */
  conversationId?: ConversationId;
  /**
   * Timestamp when the failed attempt completed.
   */
  attemptedAt: string;
  /**
   * Normalized delivery failure.
   */
  error: MessageDeliveryError;
}

/**
 * Outcome returned when sending one outbound message.
 */
export type MessageDeliveryResult =
  | MessageDeliverySuccess
  | MessageDeliveryFailure;

/**
 * Successful non-message channel command such as typing or reaction updates.
 */
export interface MessageChannelCommandSuccess {
  /**
   * Indicates that the channel command succeeded.
   */
  ok: true;
}

/**
 * Failed non-message channel command such as typing or reaction updates.
 */
export interface MessageChannelCommandFailure {
  /**
   * Indicates that the channel command failed.
   */
  ok: false;
  /**
   * Normalized failure details.
   */
  error: MessageDeliveryError;
}

/**
 * Outcome returned by typing indicators and message-reaction commands.
 */
export type MessageChannelCommandResult =
  | MessageChannelCommandSuccess
  | MessageChannelCommandFailure;

/**
 * Input required to set or clear a reaction on an existing channel message.
 */
export interface SetMessageReactionInput {
  /**
   * Stable conversation identifier inside the message channel.
   */
  conversationId: ConversationId;
  /**
   * Target message identifier that should receive the reaction.
   */
  messageId: MessageId;
  /**
   * Emoji to apply, or `null` to clear the channel's reaction on the message.
   */
  emoji: string | null;
}

/**
 * Normalized application-facing interface for message delivery and inbound message intake.
 */
export interface MessageChannel {
  /**
   * Stable channel name used by runtime wiring and persistence.
   */
  readonly name: MessageChannelName;
  /**
   * Declares which receive modes the channel implementation supports.
   */
  readonly capabilities: MessageChannelCapabilities;
  /**
   * Sends one outbound message through the channel.
   */
  sendMessage(message: OutboundMessage): Promise<MessageDeliveryResult>;
  /**
   * Broadcasts a short-lived typing/activity indicator for one conversation.
   *
   * Failure modes:
   * - returns `unsupported_operation` when the channel cannot indicate typing;
   * - returns transport and auth failures from the underlying provider.
   */
  indicateTyping(
    conversationId: ConversationId,
  ): Promise<MessageChannelCommandResult>;
  /**
   * Sets or clears an emoji reaction on an existing message.
   *
   * Failure modes:
   * - returns `unsupported_operation` when reactions are unavailable;
   * - returns transport and auth failures from the underlying provider.
   */
  setMessageReaction(
    input: SetMessageReactionInput,
  ): Promise<MessageChannelCommandResult>;
}
