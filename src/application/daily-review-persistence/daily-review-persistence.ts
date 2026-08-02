import type { DailyRunGuard } from "../daily-run-guard/daily-run-guard.js";
import type { DailyMessage } from "../model-provider/index.js";
import type { OutboundMessage } from "../message-channel/index.js";
import type { MessageRecord, StateStore } from "../state-store/index.js";
import type {
  RecordDailySelectionInput,
  RecordFailedDailyDeliveryInput,
  RecordSuccessfulDailyDeliveryInput,
  RecordedDailyDelivery,
  RecordedDailySelection,
} from "./types.js";

/**
 * Application helper that records daily selections and outbound delivery outcomes consistently.
 */
export class DailyReviewPersistence {
  private readonly stateStore: StateStore;
  private readonly runGuard: DailyRunGuard;

  /**
   * Creates a persistence helper around the shared state store and run-status updater.
   */
  public constructor(stateStore: StateStore, runGuard: DailyRunGuard) {
    this.stateStore = stateStore;
    this.runGuard = runGuard;
  }

  /**
   * Persists one completed daily selection and marks the run as `selection_recorded`.
   */
  public recordSelection(input: RecordDailySelectionInput): RecordedDailySelection {
    const selectionRecord = {
      id: input.selectionRecordId,
      runId: input.run.id,
      selection: input.selection,
      createdAt: input.now,
    };

    this.stateStore.saveSelection(selectionRecord);
    this.runGuard.updateStatus({
      run: input.run,
      status: "selection_recorded",
      now: input.now,
    });

    return {
      selectionRecord,
      run: {
        ...input.run,
        status: "selection_recorded",
      },
    };
  }

  /**
   * Persists one successful outbound delivery and marks the run as `delivery_succeeded`.
   */
  public recordSuccessfulDelivery(
    input: RecordSuccessfulDailyDeliveryInput,
  ): RecordedDailyDelivery {
    const messageRecord = buildSuccessfulMessageRecord(
      input.messageRecordId,
      input.run.id,
      input.message,
      input.outboundMessage,
      input.delivery,
    );

    this.stateStore.saveMessage(messageRecord);
    this.runGuard.updateStatus({
      run: input.run,
      status: "delivery_succeeded",
      now: input.delivery.deliveredAt,
    });

    return {
      messageRecord,
      run: {
        ...input.run,
        status: "delivery_succeeded",
        completedAt: input.delivery.deliveredAt,
      },
    };
  }

  /**
   * Persists one failed outbound delivery attempt and marks the run as `delivery_failed`.
   */
  public recordFailedDelivery(
    input: RecordFailedDailyDeliveryInput,
  ): RecordedDailyDelivery {
    const messageRecord = buildFailedMessageRecord(
      input.messageRecordId,
      input.run.id,
      input.message,
      input.outboundMessage,
      input.delivery,
    );

    this.stateStore.saveMessage(messageRecord);
    this.runGuard.updateStatus({
      run: input.run,
      status: "delivery_failed",
      now: input.delivery.attemptedAt,
      errorMessage: input.delivery.error.message,
    });

    return {
      messageRecord,
      run: {
        ...input.run,
        status: "delivery_failed",
        completedAt: input.delivery.attemptedAt,
        lastErrorMessage: input.delivery.error.message,
      },
    };
  }
}

/**
 * Builds the persisted outbound message record for one successful delivery.
 */
function buildSuccessfulMessageRecord(
  messageRecordId: string,
  runId: string,
  message: DailyMessage,
  outboundMessage: OutboundMessage,
  delivery: RecordSuccessfulDailyDeliveryInput["delivery"],
) {
  const record: MessageRecord = {
    id: messageRecordId,
    direction: "outbound" as const,
    channel: delivery.channel,
    conversationId: delivery.conversationId,
    messageId: delivery.messageId,
    runId,
    body: message.body,
    status: "sent" as const,
    retryCount: 0,
    occurredAt: delivery.deliveredAt,
  };

  if (outboundMessage.replyToMessageId) {
    record.sourceMessageId = outboundMessage.replyToMessageId;
  }

  return record;
}

/**
 * Builds the persisted outbound message record for one failed delivery attempt.
 */
function buildFailedMessageRecord(
  messageRecordId: string,
  runId: string,
  message: DailyMessage,
  outboundMessage: OutboundMessage,
  delivery: RecordFailedDailyDeliveryInput["delivery"],
) {
  const record: MessageRecord = {
    id: messageRecordId,
    direction: "outbound" as const,
    channel: delivery.channel,
    conversationId:
      delivery.conversationId ?? outboundMessage.conversationId,
    messageId: messageRecordId,
    runId,
    body: message.body,
    status: "failed" as const,
    retryCount: 1,
    occurredAt: delivery.attemptedAt,
  };

  if (outboundMessage.replyToMessageId) {
    record.sourceMessageId = outboundMessage.replyToMessageId;
  }

  return record;
}
