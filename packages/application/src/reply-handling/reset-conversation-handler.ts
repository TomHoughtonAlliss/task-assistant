import { randomUUID } from "node:crypto";
import { getLocalDateString } from "../time/local-date.js";
import type { MessageDeliverySuccess } from "../message-channel/index.js";
import type {
  MessageRecord,
  StateStore,
} from "../state-store/index.js";
import type { DailyReviewRunner } from "../daily-review/index.js";
import type { InboundMessage, MessageChannel } from "../message-channel/index.js";

const resetAcknowledgement =
  "Right, wiping the current thread and starting fresh. I'll send a new one now.";

/**
 * Dependencies required to reset one conversation and trigger a fresh daily message.
 */
export interface ResetConversationHandlerDependencies {
  /**
   * Persistence boundary used to clear the active conversation summary and store reset messages.
   */
  stateStore: StateStore;
  /**
   * Outbound message channel used to acknowledge the reset command.
   */
  messageChannel: MessageChannel;
  /**
   * Daily-review orchestration used to send the fresh follow-up daily message.
   */
  dailyReviewRunner: DailyReviewRunner;
  /**
   * IANA timezone used to derive the correct local date for manual reset runs.
   */
  timezone: string;
}

/**
 * Handles the `/reset` chat command by clearing active context and sending a fresh daily message.
 */
export class ResetConversationHandler {
  private readonly dependencies: ResetConversationHandlerDependencies;

  /**
   * Creates the reset-command handler around the shared runtime boundaries.
   */
  public constructor(dependencies: ResetConversationHandlerDependencies) {
    this.dependencies = dependencies;
  }

  /**
   * Clears active conversation context, acknowledges the reset, and triggers a fresh daily message.
   */
  public async handle(inboundMessage: InboundMessage): Promise<void> {
    this.dependencies.stateStore.clearConversationSummary(
      inboundMessage.conversationId,
    );
    this.dependencies.stateStore.saveMessage(
      buildInboundResetMessageRecord(inboundMessage),
    );

    const acknowledgement = await this.dependencies.messageChannel.sendMessage({
      conversationId: inboundMessage.conversationId,
      body: resetAcknowledgement,
      replyToMessageId: inboundMessage.messageId,
    });
    if (!acknowledgement.ok) {
      throw new Error(acknowledgement.error.message);
    }

    this.dependencies.stateStore.saveMessage(
      buildOutboundResetMessageRecord(inboundMessage, acknowledgement),
    );
    await this.dependencies.dailyReviewRunner.runManual({
      conversationId: inboundMessage.conversationId,
      localDate: getLocalDateString(
        new Date(inboundMessage.occurredAt),
        this.dependencies.timezone,
      ),
      reason: "manual_reset",
      triggeredAt: inboundMessage.occurredAt,
    });
  }
}

/**
 * Builds the stored inbound message record for one `/reset` command.
 */
function buildInboundResetMessageRecord(inboundMessage: InboundMessage): MessageRecord {
  const record: MessageRecord = {
    id: randomUUID(),
    direction: "inbound",
    channel: inboundMessage.channel,
    conversationId: inboundMessage.conversationId,
    messageId: inboundMessage.messageId,
    body: inboundMessage.text,
    status: "received",
    retryCount: 0,
    occurredAt: inboundMessage.occurredAt,
  };

  if (inboundMessage.sourceMessageId) {
    record.sourceMessageId = inboundMessage.sourceMessageId;
  }

  return record;
}

/**
 * Builds the stored outbound acknowledgement record for one successful reset acknowledgement.
 */
function buildOutboundResetMessageRecord(
  inboundMessage: InboundMessage,
  acknowledgement: MessageDeliverySuccess,
): MessageRecord {
  return {
    id: randomUUID(),
    direction: "outbound",
    channel: acknowledgement.channel,
    conversationId: acknowledgement.conversationId,
    messageId: acknowledgement.messageId,
    sourceMessageId: inboundMessage.messageId,
    body: resetAcknowledgement,
    status: "sent",
    retryCount: 0,
    occurredAt: acknowledgement.deliveredAt,
  };
}
