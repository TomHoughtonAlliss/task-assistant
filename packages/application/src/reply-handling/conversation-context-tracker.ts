import { randomUUID } from "node:crypto";
import type { ConversationReply } from "@task-assistant/domain";
import type {
  InboundMessage,
  MessageDeliverySuccess,
  OutboundMessage,
} from "../message-channel/index.js";
import type {
  ConversationSummaryRecord,
  MessageRecord,
  StateStore,
} from "../state-store/index.js";
import type { ReplyHandlingContext } from "./types.js";

const retainedSummaryMessageCount = 8;
const maxSummaryLength = 2000;

/**
 * Dependencies required to persist bounded conversational context after one turn.
 */
export interface ConversationContextTrackerDependencies {
  /**
   * Persistence boundary used to save messages and rolling conversation summaries.
   */
  stateStore: StateStore;
}

/**
 * Persisted input needed to record one completed conversational turn.
 */
export interface RecordConversationTurnInput {
  /**
   * Original normalized inbound user message.
   */
  inboundMessage: InboundMessage;
  /**
   * Loaded bounded context used for this turn.
   */
  context: ReplyHandlingContext;
  /**
   * Structured conversational reply returned by the model.
   */
  reply: ConversationReply;
  /**
   * Outbound channel-agnostic message that was sent successfully.
   */
  outboundMessage: OutboundMessage;
  /**
   * Successful delivery outcome returned by the message channel.
   */
  delivery: MessageDeliverySuccess;
}

/**
 * Saves recent message history and current-task tracking after one successful reply turn.
 */
export class ConversationContextTracker {
  private readonly dependencies: ConversationContextTrackerDependencies;

  /**
   * Creates the conversation-context tracker around the shared state store.
   */
  public constructor(dependencies: ConversationContextTrackerDependencies) {
    this.dependencies = dependencies;
  }

  /**
   * Persists one completed inbound/outbound conversational turn and updates the bounded summary.
   */
  public recordTurn(input: RecordConversationTurnInput): void {
    const inboundRecord = buildInboundMessageRecord(input.inboundMessage);
    const outboundRecord = buildOutboundMessageRecord(
      input.outboundMessage,
      input.delivery,
    );

    this.dependencies.stateStore.saveMessage(inboundRecord);
    this.dependencies.stateStore.saveMessage(outboundRecord);
    this.dependencies.stateStore.saveConversationSummary(
      buildConversationSummaryRecord(
        input.context,
        input.inboundMessage,
        outboundRecord,
        input.reply,
      ),
    );
  }
}

/**
 * Builds the persisted inbound message record for one received user message.
 */
function buildInboundMessageRecord(inboundMessage: InboundMessage): MessageRecord {
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
 * Builds the persisted outbound message record for one successful assistant reply.
 */
function buildOutboundMessageRecord(
  outboundMessage: OutboundMessage,
  delivery: MessageDeliverySuccess,
): MessageRecord {
  const record: MessageRecord = {
    id: randomUUID(),
    direction: "outbound",
    channel: delivery.channel,
    conversationId: delivery.conversationId,
    messageId: delivery.messageId,
    body: outboundMessage.body,
    status: "sent",
    retryCount: 0,
    occurredAt: delivery.deliveredAt,
  };

  if (outboundMessage.replyToMessageId) {
    record.sourceMessageId = outboundMessage.replyToMessageId;
  }

  return record;
}

/**
 * Builds the updated bounded conversation summary after one successful turn.
 */
function buildConversationSummaryRecord(
  context: ReplyHandlingContext,
  inboundMessage: InboundMessage,
  outboundRecord: MessageRecord,
  reply: ConversationReply,
): ConversationSummaryRecord {
  const existingSummary = context.conversationSummary;
  const currentTaskId = selectCurrentTaskId(context, reply);
  const summaryRecord: ConversationSummaryRecord = {
    id: existingSummary?.id ?? randomUUID(),
    conversationId: inboundMessage.conversationId,
    summary: buildSummaryText(context, inboundMessage, outboundRecord),
    updatedAt: outboundRecord.occurredAt,
  };

  if (currentTaskId) {
    summaryRecord.currentTaskId = currentTaskId;
  }

  summaryRecord.lastInboundMessageId = inboundMessage.messageId;
  summaryRecord.lastOutboundMessageId = outboundRecord.messageId;

  return summaryRecord;
}

/**
 * Selects the persisted current task for the updated conversation summary.
 */
function selectCurrentTaskId(
  context: ReplyHandlingContext,
  reply: ConversationReply,
): string | undefined {
  if (reply.currentTaskId) {
    return reply.currentTaskId;
  }

  if (context.currentTask) {
    return context.currentTask.id;
  }

  return context.linkedSelection?.selection.mainTaskId;
}

/**
 * Builds a small rolling plain-text summary from the bounded recent message window.
 */
function buildSummaryText(
  context: ReplyHandlingContext,
  inboundMessage: InboundMessage,
  outboundRecord: MessageRecord,
): string {
  const historicalLines = [...context.recentMessages]
    .reverse()
    .slice(-retainedSummaryMessageCount)
    .map(formatStoredMessageSummaryLine);
  const currentTurnLines = [
    `user: ${inboundMessage.text}`,
    `assistant: ${outboundRecord.body}`,
  ];
  const summary = [...historicalLines, ...currentTurnLines].join("\n");

  if (summary.length <= maxSummaryLength) {
    return summary;
  }

  return summary.slice(summary.length - maxSummaryLength);
}

/**
 * Formats one persisted message record as a compact summary line.
 */
function formatStoredMessageSummaryLine(message: MessageRecord): string {
  const speaker = message.direction === "inbound" ? "user" : "assistant";
  return `${speaker}: ${message.body}`;
}
