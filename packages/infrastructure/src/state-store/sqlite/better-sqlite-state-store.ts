import Database from "better-sqlite3";
import type {
  ActionRecord,
  ConversationSummaryRecord,
  DailyRunReservation,
  DailyRunRecord,
  MessageRecord,
  SelectionHistoryEntry,
  SelectionRecord,
  SnoozeRecord,
  StateStore,
} from "@task-assistant/application/state-store";
import type { ProposedTaskAction, TaskSelection } from "@task-assistant/domain";
import { proposedTaskActionSchema, taskSelectionSchema } from "@task-assistant/domain";
import { applySqliteMigrations } from "./migrate.js";

/**
 * SQLite-backed state store implementation using `better-sqlite3`.
 */
export class BetterSqliteStateStore implements StateStore {
  private readonly database: Database.Database;

  /**
   * Creates a synchronous SQLite-backed state store around an existing database connection.
   */
  public constructor(database: Database.Database) {
    this.database = database;
  }

  /**
   * Applies pending SQL migrations for the configured SQLite database.
   */
  public migrate(): void {
    applySqliteMigrations(this.database);
  }

  /**
   * Attempts to reserve a daily run key for work, reusing failed records safely when possible.
   */
  public reserveDailyRun(record: DailyRunRecord): DailyRunReservation {
    const reserveTransaction = this.database.transaction(
      (candidate: DailyRunRecord): DailyRunReservation => {
        const existingRow = this.database
          .prepare(
            `
              SELECT
                id,
                user_key,
                run_key,
                local_date,
                status,
                started_at,
                completed_at,
                last_error_message
              FROM daily_runs
              WHERE run_key = ?
            `,
          )
          .get(candidate.runKey) as DailyRunRow | undefined;

        if (!existingRow) {
          this.database
            .prepare(
              `
                INSERT INTO daily_runs (
                  id,
                  user_key,
                  run_key,
                  local_date,
                  status,
                  started_at,
                  completed_at,
                  last_error_message
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
              `,
            )
            .run(
              candidate.id,
              candidate.userKey,
              candidate.runKey,
              candidate.localDate,
              candidate.status,
              candidate.startedAt,
              candidate.completedAt ?? null,
              candidate.lastErrorMessage ?? null,
            );

          return {
            status: "reserved",
            record: candidate,
          };
        }

        const existingRecord = mapDailyRunRow(existingRow);

        if (
          existingRecord.status === "delivery_succeeded" ||
          existingRecord.status === "completed"
        ) {
          return {
            status: "already_succeeded",
            record: existingRecord,
          };
        }

        if (
          existingRecord.status === "reserved" ||
          existingRecord.status === "selection_recorded"
        ) {
          return {
            status: "already_in_progress",
            record: existingRecord,
          };
        }

        const retriedRecord: DailyRunRecord = {
          ...existingRecord,
          status: "reserved",
          startedAt: candidate.startedAt,
        };

        delete retriedRecord.completedAt;
        delete retriedRecord.lastErrorMessage;

        this.database
          .prepare(
            `
              UPDATE daily_runs
              SET status = ?,
                  started_at = ?,
                  completed_at = NULL,
                  last_error_message = NULL
              WHERE run_key = ?
            `,
          )
          .run(
            retriedRecord.status,
            retriedRecord.startedAt,
            retriedRecord.runKey,
          );

        return {
          status: "reserved",
          record: retriedRecord,
        };
      },
    );

    return reserveTransaction(record);
  }

  /**
   * Creates or replaces a daily run record.
   */
  public saveDailyRun(record: DailyRunRecord): void {
    this.database
      .prepare(
        `
          INSERT INTO daily_runs (
            id,
            user_key,
            run_key,
            local_date,
            status,
            started_at,
            completed_at,
            last_error_message
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            user_key = excluded.user_key,
            run_key = excluded.run_key,
            local_date = excluded.local_date,
            status = excluded.status,
            started_at = excluded.started_at,
            completed_at = excluded.completed_at,
            last_error_message = excluded.last_error_message
        `,
      )
      .run(
        record.id,
        record.userKey,
        record.runKey,
        record.localDate,
        record.status,
        record.startedAt,
        record.completedAt ?? null,
        record.lastErrorMessage ?? null,
      );
  }

  /**
   * Loads one daily run by its unique run key.
   */
  public getDailyRunByKey(runKey: string): DailyRunRecord | null {
    const row = this.database
      .prepare(
        `
          SELECT
            id,
            user_key,
            run_key,
            local_date,
            status,
            started_at,
            completed_at,
            last_error_message
          FROM daily_runs
          WHERE run_key = ?
        `,
      )
      .get(runKey) as DailyRunRow | undefined;

    return row ? mapDailyRunRow(row) : null;
  }

  /**
   * Saves one selection record linked to a daily run.
   */
  public saveSelection(record: SelectionRecord): void {
    this.database
      .prepare(
        `
          INSERT INTO selections (
            id,
            run_id,
            main_task_id,
            additional_task_ids,
            reason,
            created_at
          )
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            run_id = excluded.run_id,
            main_task_id = excluded.main_task_id,
            additional_task_ids = excluded.additional_task_ids,
            reason = excluded.reason,
            created_at = excluded.created_at
        `,
      )
      .run(
        record.id,
        record.runId,
        record.selection.mainTaskId,
        JSON.stringify(record.selection.additionalTaskIds),
        record.selection.reason,
        record.createdAt,
      );
  }

  /**
   * Returns recent selection history for a task, newest first.
   */
  public listSelectionHistoryForTask(
    taskId: string,
    limit: number,
  ): SelectionHistoryEntry[] {
    const rows = this.database
      .prepare(
        `
          SELECT
            selections.run_id,
            daily_runs.local_date,
            selections.main_task_id,
            selections.additional_task_ids,
            selections.reason,
            selections.created_at
          FROM selections
          INNER JOIN daily_runs ON daily_runs.id = selections.run_id
          WHERE selections.main_task_id = ?
             OR EXISTS (
               SELECT 1
               FROM json_each(selections.additional_task_ids)
               WHERE json_each.value = ?
             )
          ORDER BY selections.created_at DESC
          LIMIT ?
        `,
      )
      .all(taskId, taskId, limit) as SelectionHistoryRow[];

    return rows.map(mapSelectionHistoryRow);
  }

  /**
   * Returns selection history for a task inside one inclusive local-date window, newest first.
   */
  public listSelectionHistoryForTaskInDateWindow(
    taskId: string,
    dateFrom: string,
    dateTo: string,
  ): SelectionHistoryEntry[] {
    const rows = this.database
      .prepare(
        `
          SELECT
            selections.id,
            selections.run_id,
            daily_runs.local_date,
            selections.main_task_id,
            selections.additional_task_ids,
            selections.reason,
            selections.created_at
          FROM selections
          INNER JOIN daily_runs ON daily_runs.id = selections.run_id
          WHERE daily_runs.local_date >= ?
            AND daily_runs.local_date <= ?
            AND (
              selections.main_task_id = ?
              OR EXISTS (
                SELECT 1
                FROM json_each(selections.additional_task_ids)
                WHERE json_each.value = ?
              )
            )
          ORDER BY selections.created_at DESC
        `,
      )
      .all(dateFrom, dateTo, taskId, taskId) as SelectionRecordRow[];

    return rows.map(mapSelectionRecordRowToHistoryEntry);
  }

  /**
   * Loads one selection record by the associated daily run identifier.
   */
  public getSelectionByRunId(runId: string): SelectionRecord | null {
    const row = this.database
      .prepare(
        `
          SELECT
            id,
            run_id,
            main_task_id,
            additional_task_ids,
            reason,
            created_at
          FROM selections
          WHERE run_id = ?
        `,
      )
      .get(runId) as SelectionRecordRow | undefined;

    return row ? mapSelectionRecordRow(row) : null;
  }

  /**
   * Saves one local snooze record.
   */
  public saveSnooze(record: SnoozeRecord): void {
    this.database
      .prepare(
        `
          INSERT INTO snoozes (
            id,
            task_id,
            snoozed_until,
            reason,
            source,
            created_at,
            cleared_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            task_id = excluded.task_id,
            snoozed_until = excluded.snoozed_until,
            reason = excluded.reason,
            source = excluded.source,
            created_at = excluded.created_at,
            cleared_at = excluded.cleared_at
        `,
      )
      .run(
        record.id,
        record.taskId,
        record.snoozedUntil,
        record.reason ?? null,
        record.source ?? null,
        record.createdAt,
        record.clearedAt ?? null,
      );
  }

  /**
   * Returns active snooze records at the supplied timestamp.
   */
  public listActiveSnoozes(at: string): SnoozeRecord[] {
    const rows = this.database
      .prepare(
        `
          SELECT
            id,
            task_id,
            snoozed_until,
            reason,
            source,
            created_at,
            cleared_at
          FROM snoozes
          WHERE cleared_at IS NULL
            AND snoozed_until > ?
          ORDER BY snoozed_until ASC
        `,
      )
      .all(at) as SnoozeRow[];

    return rows.map(mapSnoozeRow);
  }

  /**
   * Saves one inbound or outbound message record.
   */
  public saveMessage(record: MessageRecord): void {
    this.database
      .prepare(
        `
          INSERT INTO messages (
            id,
            direction,
            channel,
            conversation_id,
            message_id,
            source_message_id,
            run_id,
            body,
            status,
            retry_count,
            occurred_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            direction = excluded.direction,
            channel = excluded.channel,
            conversation_id = excluded.conversation_id,
            message_id = excluded.message_id,
            source_message_id = excluded.source_message_id,
            run_id = excluded.run_id,
            body = excluded.body,
            status = excluded.status,
            retry_count = excluded.retry_count,
            occurred_at = excluded.occurred_at
        `,
      )
      .run(
        record.id,
        record.direction,
        record.channel,
        record.conversationId,
        record.messageId,
        record.sourceMessageId ?? null,
        record.runId ?? null,
        record.body,
        record.status,
        record.retryCount,
        record.occurredAt,
      );
  }

  /**
   * Returns recent messages for a conversation, newest first.
   */
  public listMessagesForConversation(
    conversationId: string,
    limit: number,
  ): MessageRecord[] {
    const rows = this.database
      .prepare(
        `
          SELECT
            id,
            direction,
            channel,
            conversation_id,
            message_id,
            source_message_id,
            run_id,
            body,
            status,
            retry_count,
            occurred_at
          FROM messages
          WHERE conversation_id = ?
          ORDER BY occurred_at DESC
          LIMIT ?
        `,
      )
      .all(conversationId, limit) as MessageRow[];

    return rows.map(mapMessageRow);
  }

  /**
   * Returns message records linked to one daily run, newest first.
   */
  public listMessagesForRun(runId: string): MessageRecord[] {
    const rows = this.database
      .prepare(
        `
          SELECT
            id,
            direction,
            channel,
            conversation_id,
            message_id,
            source_message_id,
            run_id,
            body,
            status,
            retry_count,
            occurred_at
          FROM messages
          WHERE run_id = ?
          ORDER BY occurred_at DESC
        `,
      )
      .all(runId) as MessageRow[];

    return rows.map(mapMessageRow);
  }

  /**
   * Saves one conversation summary record.
   */
  public saveConversationSummary(record: ConversationSummaryRecord): void {
    this.database
      .prepare(
        `
          INSERT INTO conversation_summaries (
            id,
            conversation_id,
            current_task_id,
            summary,
            last_inbound_message_id,
            last_outbound_message_id,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            conversation_id = excluded.conversation_id,
            current_task_id = excluded.current_task_id,
            summary = excluded.summary,
            last_inbound_message_id = excluded.last_inbound_message_id,
            last_outbound_message_id = excluded.last_outbound_message_id,
            updated_at = excluded.updated_at
        `,
      )
      .run(
        record.id,
        record.conversationId,
        record.currentTaskId ?? null,
        record.summary,
        record.lastInboundMessageId ?? null,
        record.lastOutboundMessageId ?? null,
        record.updatedAt,
      );
  }

  /**
   * Loads one conversation summary by conversation identifier.
   */
  public getConversationSummary(
    conversationId: string,
  ): ConversationSummaryRecord | null {
    const row = this.database
      .prepare(
        `
          SELECT
            id,
            conversation_id,
            current_task_id,
            summary,
            last_inbound_message_id,
            last_outbound_message_id,
            updated_at
          FROM conversation_summaries
          WHERE conversation_id = ?
        `,
      )
      .get(conversationId) as ConversationSummaryRow | undefined;

    return row ? mapConversationSummaryRow(row) : null;
  }

  /**
   * Clears the active bounded conversation summary for one conversation.
   */
  public clearConversationSummary(conversationId: string): void {
    this.database
      .prepare(
        `
          DELETE FROM conversation_summaries
          WHERE conversation_id = ?
        `,
      )
      .run(conversationId);
  }

  /**
   * Saves one action record used for confirmation and dedupe tracking.
   */
  public saveActionRecord(record: ActionRecord): void {
    this.database
      .prepare(
        `
          INSERT INTO action_records (
            id,
            idempotency_key,
            conversation_id,
            task_id,
            action_type,
            action_payload,
            status,
            requires_confirmation,
            source_message_id,
            proposed_at,
            confirmed_at,
            executed_at,
            error_message
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            idempotency_key = excluded.idempotency_key,
            conversation_id = excluded.conversation_id,
            task_id = excluded.task_id,
            action_type = excluded.action_type,
            action_payload = excluded.action_payload,
            status = excluded.status,
            requires_confirmation = excluded.requires_confirmation,
            source_message_id = excluded.source_message_id,
            proposed_at = excluded.proposed_at,
            confirmed_at = excluded.confirmed_at,
            executed_at = excluded.executed_at,
            error_message = excluded.error_message
        `,
      )
      .run(
        record.id,
        record.idempotencyKey,
        record.conversationId,
        record.taskId ?? null,
        record.action.type,
        JSON.stringify(record.action),
        record.status,
        record.action.requiresConfirmation ? 1 : 0,
        record.sourceMessageId ?? null,
        record.proposedAt,
        record.confirmedAt ?? null,
        record.executedAt ?? null,
        record.errorMessage ?? null,
      );
  }

  /**
   * Loads one action record by its idempotency key.
   */
  public getActionRecordByIdempotencyKey(
    idempotencyKey: string,
  ): ActionRecord | null {
    const row = this.database
      .prepare(
        `
          SELECT
            id,
            idempotency_key,
            conversation_id,
            task_id,
            action_payload,
            status,
            source_message_id,
            proposed_at,
            confirmed_at,
            executed_at,
            error_message
          FROM action_records
          WHERE idempotency_key = ?
        `,
      )
      .get(idempotencyKey) as ActionRecordRow | undefined;

    return row ? mapActionRecordRow(row) : null;
  }

  /**
   * Closes the underlying SQLite connection.
   */
  public close(): void {
    this.database.close();
  }
}

/**
 * Raw row shape returned when reading one daily run record.
 */
interface DailyRunRow {
  id: string;
  user_key: string;
  run_key: string;
  local_date: string;
  status: DailyRunRecord["status"];
  started_at: string;
  completed_at: string | null;
  last_error_message: string | null;
}

/**
 * Raw row shape returned when reading selection history entries.
 */
interface SelectionHistoryRow {
  run_id: string;
  local_date: string;
  main_task_id: string;
  additional_task_ids: string;
  reason: string;
  created_at: string;
}

/**
 * Raw row shape returned when reading selection records.
 */
interface SelectionRecordRow {
  id: string;
  run_id: string;
  main_task_id: string;
  additional_task_ids: string;
  reason: string;
  created_at: string;
  local_date?: string;
}

/**
 * Raw row shape returned when reading snooze records.
 */
interface SnoozeRow {
  id: string;
  task_id: string;
  snoozed_until: string;
  reason: string | null;
  source: string | null;
  created_at: string;
  cleared_at: string | null;
}

/**
 * Raw row shape returned when reading message records.
 */
interface MessageRow {
  id: string;
  direction: MessageRecord["direction"];
  channel: string;
  conversation_id: string;
  message_id: string;
  source_message_id: string | null;
  run_id: string | null;
  body: string;
  status: MessageRecord["status"];
  retry_count: number;
  occurred_at: string;
}

/**
 * Raw row shape returned when reading conversation summary records.
 */
interface ConversationSummaryRow {
  id: string;
  conversation_id: string;
  current_task_id: string | null;
  summary: string;
  last_inbound_message_id: string | null;
  last_outbound_message_id: string | null;
  updated_at: string;
}

/**
 * Raw row shape returned when reading action records.
 */
interface ActionRecordRow {
  id: string;
  idempotency_key: string;
  conversation_id: string;
  task_id: string | null;
  action_payload: string;
  status: ActionRecord["status"];
  source_message_id: string | null;
  proposed_at: string;
  confirmed_at: string | null;
  executed_at: string | null;
  error_message: string | null;
}

/**
 * Maps one daily run row into the application-facing record shape.
 */
function mapDailyRunRow(row: DailyRunRow): DailyRunRecord {
  const record: DailyRunRecord = {
    id: row.id,
    userKey: row.user_key,
    runKey: row.run_key,
    localDate: row.local_date,
    status: row.status,
    startedAt: row.started_at,
  };

  if (row.completed_at) {
    record.completedAt = row.completed_at;
  }

  if (row.last_error_message) {
    record.lastErrorMessage = row.last_error_message;
  }

  return record;
}

/**
 * Maps one selection-history row into the application-facing read model.
 */
function mapSelectionHistoryRow(row: SelectionHistoryRow): SelectionHistoryEntry {
  const selection: TaskSelection = taskSelectionSchema.parse({
    mainTaskId: row.main_task_id,
    additionalTaskIds: JSON.parse(row.additional_task_ids) as string[],
    reason: row.reason,
  });

  return {
    runId: row.run_id,
    localDate: row.local_date,
    selection,
    createdAt: row.created_at,
  };
}

/**
 * Maps one selection row into the application-facing persisted selection record.
 */
function mapSelectionRecordRow(row: SelectionRecordRow): SelectionRecord {
  return {
    id: row.id,
    runId: row.run_id,
    selection: taskSelectionSchema.parse({
      mainTaskId: row.main_task_id,
      additionalTaskIds: JSON.parse(row.additional_task_ids) as string[],
      reason: row.reason,
    }),
    createdAt: row.created_at,
  };
}

/**
 * Maps one selection row that also carries `local_date` into the selection-history read model.
 */
function mapSelectionRecordRowToHistoryEntry(
  row: SelectionRecordRow,
): SelectionHistoryEntry {
  if (!row.local_date) {
    throw new Error("Expected local_date when mapping selection history row");
  }

  return {
    runId: row.run_id,
    localDate: row.local_date,
    selection: taskSelectionSchema.parse({
      mainTaskId: row.main_task_id,
      additionalTaskIds: JSON.parse(row.additional_task_ids) as string[],
      reason: row.reason,
    }),
    createdAt: row.created_at,
  };
}

/**
 * Maps one snooze row into the application-facing record shape.
 */
function mapSnoozeRow(row: SnoozeRow): SnoozeRecord {
  const record: SnoozeRecord = {
    id: row.id,
    taskId: row.task_id,
    snoozedUntil: row.snoozed_until,
    createdAt: row.created_at,
  };

  if (row.reason) {
    record.reason = row.reason;
  }

  if (row.source) {
    record.source = row.source;
  }

  if (row.cleared_at) {
    record.clearedAt = row.cleared_at;
  }

  return record;
}

/**
 * Maps one message row into the application-facing record shape.
 */
function mapMessageRow(row: MessageRow): MessageRecord {
  const record: MessageRecord = {
    id: row.id,
    direction: row.direction,
    channel: row.channel,
    conversationId: row.conversation_id,
    messageId: row.message_id,
    body: row.body,
    status: row.status,
    retryCount: row.retry_count,
    occurredAt: row.occurred_at,
  };

  if (row.source_message_id) {
    record.sourceMessageId = row.source_message_id;
  }

  if (row.run_id) {
    record.runId = row.run_id;
  }

  return record;
}

/**
 * Maps one conversation-summary row into the application-facing record shape.
 */
function mapConversationSummaryRow(
  row: ConversationSummaryRow,
): ConversationSummaryRecord {
  const record: ConversationSummaryRecord = {
    id: row.id,
    conversationId: row.conversation_id,
    summary: row.summary,
    updatedAt: row.updated_at,
  };

  if (row.current_task_id) {
    record.currentTaskId = row.current_task_id;
  }

  if (row.last_inbound_message_id) {
    record.lastInboundMessageId = row.last_inbound_message_id;
  }

  if (row.last_outbound_message_id) {
    record.lastOutboundMessageId = row.last_outbound_message_id;
  }

  return record;
}

/**
 * Maps one action-record row into the application-facing record shape.
 */
function mapActionRecordRow(row: ActionRecordRow): ActionRecord {
  const action = proposedTaskActionSchema.parse(
    JSON.parse(row.action_payload) as ProposedTaskAction,
  );
  const record: ActionRecord = {
    id: row.id,
    idempotencyKey: row.idempotency_key,
    conversationId: row.conversation_id,
    action,
    status: row.status,
    proposedAt: row.proposed_at,
  };

  if (row.task_id) {
    record.taskId = row.task_id;
  }

  if (row.source_message_id) {
    record.sourceMessageId = row.source_message_id;
  }

  if (row.confirmed_at) {
    record.confirmedAt = row.confirmed_at;
  }

  if (row.executed_at) {
    record.executedAt = row.executed_at;
  }

  if (row.error_message) {
    record.errorMessage = row.error_message;
  }

  return record;
}
