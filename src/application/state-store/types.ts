import type {
  ConversationId,
  MessageId,
  ProposedTaskAction,
  TaskId,
  TaskSelection,
} from "../../domain/index.js";

/**
 * Stable identifier for a persisted daily run record.
 */
export type DailyRunId = string;

/**
 * Stable identifier for a persisted selection record.
 */
export type SelectionRecordId = string;

/**
 * Stable identifier for a persisted snooze record.
 */
export type SnoozeRecordId = string;

/**
 * Stable identifier for a persisted message record.
 */
export type MessageRecordId = string;

/**
 * Stable identifier for a persisted conversation summary record.
 */
export type ConversationSummaryId = string;

/**
 * Stable identifier for a persisted action record.
 */
export type ActionRecordId = string;

/**
 * Lifecycle state for one daily run record.
 */
export type DailyRunStatus =
  | "reserved"
  | "selection_recorded"
  | "delivery_succeeded"
  | "delivery_failed"
  | "completed";

/**
 * Result of attempting to reserve a daily run key through the persistence layer.
 */
export type DailyRunReservationStatus =
  | "reserved"
  | "already_succeeded"
  | "already_in_progress";

/**
 * One persisted daily run keyed by user and local calendar date.
 */
export interface DailyRunRecord {
  /**
   * Stable record identifier.
   */
  id: DailyRunId;
  /**
   * Stable user identifier used when deriving run keys.
   */
  userKey: string;
  /**
   * Unique key derived from the user and local calendar date.
   */
  runKey: string;
  /**
   * Local calendar date for the run in `YYYY-MM-DD` format.
   */
  localDate: string;
  /**
   * Current lifecycle status for the run.
   */
  status: DailyRunStatus;
  /**
   * Timestamp when the run was first reserved.
   */
  startedAt: string;
  /**
   * Optional timestamp when the run reached its terminal state.
   */
  completedAt?: string;
  /**
   * Optional latest error message retained for debugging.
   */
  lastErrorMessage?: string;
}

/**
 * Persistence-layer outcome when trying to reserve a daily run.
 */
export interface DailyRunReservation {
  /**
   * Indicates whether the run was newly reserved, can be retried, or should be short-circuited.
   */
  status: DailyRunReservationStatus;
  /**
   * Current persisted daily run record after the reservation attempt.
   */
  record: DailyRunRecord;
}

/**
 * One persisted task selection linked to a daily run.
 */
export interface SelectionRecord {
  /**
   * Stable record identifier.
   */
  id: SelectionRecordId;
  /**
   * Associated daily run identifier.
   */
  runId: DailyRunId;
  /**
   * Structured task selection produced for the run.
   */
  selection: TaskSelection;
  /**
   * Timestamp when the selection was stored.
   */
  createdAt: string;
}

/**
 * One persisted local snooze or temporary deprioritisation for a task.
 */
export interface SnoozeRecord {
  /**
   * Stable record identifier.
   */
  id: SnoozeRecordId;
  /**
   * Task affected by the local snooze.
   */
  taskId: TaskId;
  /**
   * Timestamp until which the task should be treated as snoozed.
   */
  snoozedUntil: string;
  /**
   * Optional explanation kept for debugging or future conversational context.
   */
  reason?: string;
  /**
   * Optional source for the snooze decision, such as `user` or `assistant`.
   */
  source?: string;
  /**
   * Timestamp when the snooze record was created.
   */
  createdAt: string;
  /**
   * Optional timestamp when the snooze was cleared early.
   */
  clearedAt?: string;
}

/**
 * Direction of a stored message record.
 */
export type MessageDirection = "inbound" | "outbound";

/**
 * Delivery or receipt state for a stored message record.
 */
export type MessageRecordStatus =
  | "pending"
  | "received"
  | "sent"
  | "failed";

/**
 * One inbound or outbound message persisted for correlation and retry handling.
 */
export interface MessageRecord {
  /**
   * Stable record identifier.
   */
  id: MessageRecordId;
  /**
   * Direction of the message relative to the application.
   */
  direction: MessageDirection;
  /**
   * Stable message-channel name such as `telegram`.
   */
  channel: string;
  /**
   * Stable channel conversation identifier.
   */
  conversationId: ConversationId;
  /**
   * Stable application-level message identifier.
   */
  messageId: MessageId;
  /**
   * Optional source message identifier used for reply correlation.
   */
  sourceMessageId?: MessageId;
  /**
   * Optional associated daily run identifier.
   */
  runId?: DailyRunId;
  /**
   * Stored message body.
   */
  body: string;
  /**
   * Current persistence or delivery status.
   */
  status: MessageRecordStatus;
  /**
   * Number of delivery attempts recorded for the message.
   */
  retryCount: number;
  /**
   * Timestamp when the message was sent or received.
   */
  occurredAt: string;
}

/**
 * One persisted bounded conversation summary plus current-task pointer.
 */
export interface ConversationSummaryRecord {
  /**
   * Stable record identifier.
   */
  id: ConversationSummaryId;
  /**
   * Stable channel conversation identifier.
   */
  conversationId: ConversationId;
  /**
   * Optional current task under discussion.
   */
  currentTaskId?: TaskId;
  /**
   * Bounded stored summary of the conversation so far.
   */
  summary: string;
  /**
   * Optional latest inbound message identifier for correlation.
   */
  lastInboundMessageId?: MessageId;
  /**
   * Optional latest outbound message identifier for correlation.
   */
  lastOutboundMessageId?: MessageId;
  /**
   * Timestamp when the summary was last updated.
   */
  updatedAt: string;
}

/**
 * Lifecycle state for one proposed task-provider action.
 */
export type ActionRecordStatus =
  | "proposed"
  | "confirmed"
  | "rejected"
  | "executed"
  | "failed";

/**
 * One persisted task-provider action proposal and execution outcome.
 */
export interface ActionRecord {
  /**
   * Stable record identifier.
   */
  id: ActionRecordId;
  /**
   * Unique key used to prevent duplicate execution across retries.
   */
  idempotencyKey: string;
  /**
   * Conversation that produced the action proposal.
   */
  conversationId: ConversationId;
  /**
   * Optional task the action refers to, when applicable.
   */
  taskId?: TaskId;
  /**
   * Structured action payload proposed by the model or confirmed by the user.
   */
  action: ProposedTaskAction;
  /**
   * Current lifecycle status for the action.
   */
  status: ActionRecordStatus;
  /**
   * Optional associated message that originated the action.
   */
  sourceMessageId?: MessageId;
  /**
   * Timestamp when the action was first proposed.
   */
  proposedAt: string;
  /**
   * Optional timestamp when the action was confirmed.
   */
  confirmedAt?: string;
  /**
   * Optional timestamp when the action was executed.
   */
  executedAt?: string;
  /**
   * Optional latest execution or validation error retained for debugging.
   */
  errorMessage?: string;
}

/**
 * Read model used when loading recent selection history for anti-repetition logic.
 */
export interface SelectionHistoryEntry {
  /**
   * Associated run identifier.
   */
  runId: DailyRunId;
  /**
   * User-local calendar date for the selection.
   */
  localDate: string;
  /**
   * Stored selection payload for the run.
   */
  selection: TaskSelection;
  /**
   * Timestamp when the selection was stored.
   */
  createdAt: string;
}

/**
 * Application-facing persistence boundary for runs, selections, messages, summaries, and actions.
 */
export interface StateStore {
  /**
   * Creates tables and applies pending migrations for the configured store.
   */
  migrate(): void;
  /**
   * Attempts to reserve a daily run key for work, reusing failed records safely when possible.
   */
  reserveDailyRun(record: DailyRunRecord): DailyRunReservation;
  /**
   * Creates or replaces a daily run record after it has already been reserved.
   */
  saveDailyRun(record: DailyRunRecord): void;
  /**
   * Loads one daily run by its unique run key.
   */
  getDailyRunByKey(runKey: string): DailyRunRecord | null;
  /**
   * Saves one selection record linked to a daily run.
   */
  saveSelection(record: SelectionRecord): void;
  /**
   * Returns recent selection history for a task, newest first.
   */
  listSelectionHistoryForTask(taskId: TaskId, limit: number): SelectionHistoryEntry[];
  /**
   * Returns selection history for a task inside one inclusive local-date window, newest first.
   */
  listSelectionHistoryForTaskInDateWindow(
    taskId: TaskId,
    dateFrom: string,
    dateTo: string,
  ): SelectionHistoryEntry[];
  /**
   * Loads one selection record by the associated daily run identifier.
   */
  getSelectionByRunId(runId: DailyRunId): SelectionRecord | null;
  /**
   * Saves one local snooze record.
   */
  saveSnooze(record: SnoozeRecord): void;
  /**
   * Returns active snooze records at the supplied timestamp.
   */
  listActiveSnoozes(at: string): SnoozeRecord[];
  /**
   * Saves one inbound or outbound message record.
   */
  saveMessage(record: MessageRecord): void;
  /**
   * Returns recent messages for a conversation, newest first.
   */
  listMessagesForConversation(
    conversationId: ConversationId,
    limit: number,
  ): MessageRecord[];
  /**
   * Returns message records linked to one daily run, newest first.
   */
  listMessagesForRun(runId: DailyRunId): MessageRecord[];
  /**
   * Saves one conversation summary record.
   */
  saveConversationSummary(record: ConversationSummaryRecord): void;
  /**
   * Loads one conversation summary by conversation identifier.
   */
  getConversationSummary(
    conversationId: ConversationId,
  ): ConversationSummaryRecord | null;
  /**
   * Clears the active bounded conversation summary and current-task pointer for one conversation.
   */
  clearConversationSummary(conversationId: ConversationId): void;
  /**
   * Saves one action record used for confirmation and dedupe tracking.
   */
  saveActionRecord(record: ActionRecord): void;
  /**
   * Loads one action record by its idempotency key.
   */
  getActionRecordByIdempotencyKey(idempotencyKey: string): ActionRecord | null;
  /**
   * Closes the underlying persistence resources.
   */
  close(): void;
}
