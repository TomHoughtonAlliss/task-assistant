import type {
  MessageDeliveryFailure,
  MessageDeliverySuccess,
  OutboundMessage,
} from "../message-channel/index.js";
import type {
  DailyRunRecord,
  MessageRecord,
  SelectionRecord,
} from "../state-store/index.js";
import type { DailyMessage } from "../model-provider/index.js";
import type { TaskSelection } from "../../domain/index.js";

/**
 * Input for persisting one completed model-based selection against a reserved daily run.
 */
export interface RecordDailySelectionInput {
  /**
   * Reserved daily run that owns the selection.
   */
  run: DailyRunRecord;
  /**
   * Structured final task selection chosen for the run.
   */
  selection: TaskSelection;
  /**
   * Stable identifier for the persisted selection record.
   */
  selectionRecordId: string;
  /**
   * Timestamp when the selection was recorded.
   */
  now: string;
}

/**
 * Input for persisting one successful outbound delivery attempt.
 */
export interface RecordSuccessfulDailyDeliveryInput {
  /**
   * Reserved daily run that owns the delivery attempt.
   */
  run: DailyRunRecord;
  /**
   * Generated daily message that was sent.
   */
  message: DailyMessage;
  /**
   * Original outbound channel payload used to send the message.
   */
  outboundMessage: OutboundMessage;
  /**
   * Successful delivery result returned by the message channel.
   */
  delivery: MessageDeliverySuccess;
  /**
   * Stable identifier for the persisted message record.
   */
  messageRecordId: string;
}

/**
 * Input for persisting one failed outbound delivery attempt.
 */
export interface RecordFailedDailyDeliveryInput {
  /**
   * Reserved daily run that owns the delivery attempt.
   */
  run: DailyRunRecord;
  /**
   * Generated daily message that failed to send.
   */
  message: DailyMessage;
  /**
   * Original outbound channel payload used to send the message.
   */
  outboundMessage: OutboundMessage;
  /**
   * Failed delivery result returned by the message channel.
   */
  delivery: MessageDeliveryFailure;
  /**
   * Stable identifier for the persisted message record.
   */
  messageRecordId: string;
}

/**
 * Persistence result returned after recording a selection.
 */
export interface RecordedDailySelection {
  /**
   * Persisted selection record.
   */
  selectionRecord: SelectionRecord;
  /**
   * Updated daily run after the selection status transition.
   */
  run: DailyRunRecord;
}

/**
 * Persistence result returned after recording one outbound delivery attempt.
 */
export interface RecordedDailyDelivery {
  /**
   * Persisted outbound message record.
   */
  messageRecord: MessageRecord;
  /**
   * Updated daily run after the delivery status transition.
   */
  run: DailyRunRecord;
}
