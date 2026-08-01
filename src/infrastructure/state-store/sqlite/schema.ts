import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/**
 * Stores one daily run keyed by user and local calendar date.
 */
export const dailyRunsTable = sqliteTable(
  "daily_runs",
  {
    id: text("id").primaryKey(),
    userKey: text("user_key").notNull(),
    runKey: text("run_key").notNull(),
    localDate: text("local_date").notNull(),
    status: text("status").notNull(),
    startedAt: text("started_at").notNull(),
    completedAt: text("completed_at"),
    lastErrorMessage: text("last_error_message"),
  },
  (table) => ({
    runKeyIndex: uniqueIndex("daily_runs_run_key_idx").on(table.runKey),
    userDateIndex: uniqueIndex("daily_runs_user_date_idx").on(
      table.userKey,
      table.localDate,
    ),
  }),
);

/**
 * Stores one persisted selection linked to a daily run.
 */
export const selectionsTable = sqliteTable(
  "selections",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => dailyRunsTable.id, {
        onDelete: "cascade",
      }),
    mainTaskId: text("main_task_id").notNull(),
    additionalTaskIds: text("additional_task_ids", {
      mode: "json",
    }).$type<string[]>().notNull(),
    reason: text("reason").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => ({
    runIndex: uniqueIndex("selections_run_id_idx").on(table.runId),
    mainTaskIndex: index("selections_main_task_id_idx").on(table.mainTaskId),
  }),
);

/**
 * Stores one local task snooze or temporary deprioritisation entry.
 */
export const snoozesTable = sqliteTable(
  "snoozes",
  {
    id: text("id").primaryKey(),
    taskId: text("task_id").notNull(),
    snoozedUntil: text("snoozed_until").notNull(),
    reason: text("reason"),
    source: text("source"),
    createdAt: text("created_at").notNull(),
    clearedAt: text("cleared_at"),
  },
  (table) => ({
    taskUntilIndex: index("snoozes_task_until_idx").on(
      table.taskId,
      table.snoozedUntil,
    ),
  }),
);

/**
 * Stores one inbound or outbound message record.
 */
export const messagesTable = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    direction: text("direction").notNull(),
    channel: text("channel").notNull(),
    conversationId: text("conversation_id").notNull(),
    messageId: text("message_id").notNull(),
    sourceMessageId: text("source_message_id"),
    runId: text("run_id").references(() => dailyRunsTable.id, {
      onDelete: "set null",
    }),
    body: text("body").notNull(),
    status: text("status").notNull(),
    retryCount: integer("retry_count").notNull().default(0),
    occurredAt: text("occurred_at").notNull(),
  },
  (table) => ({
    channelMessageIndex: uniqueIndex("messages_channel_message_idx").on(
      table.channel,
      table.messageId,
    ),
    conversationOccurredIndex: index("messages_conversation_occurred_idx").on(
      table.conversationId,
      table.occurredAt,
    ),
  }),
);

/**
 * Stores one bounded conversation summary and current-task pointer per conversation.
 */
export const conversationSummariesTable = sqliteTable(
  "conversation_summaries",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id").notNull(),
    currentTaskId: text("current_task_id"),
    summary: text("summary").notNull(),
    lastInboundMessageId: text("last_inbound_message_id"),
    lastOutboundMessageId: text("last_outbound_message_id"),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => ({
    conversationIndex: uniqueIndex("conversation_summaries_conversation_idx").on(
      table.conversationId,
    ),
  }),
);

/**
 * Stores one proposed or executed task-provider action and its dedupe key.
 */
export const actionRecordsTable = sqliteTable(
  "action_records",
  {
    id: text("id").primaryKey(),
    idempotencyKey: text("idempotency_key").notNull(),
    conversationId: text("conversation_id").notNull(),
    taskId: text("task_id"),
    actionType: text("action_type").notNull(),
    actionPayload: text("action_payload", {
      mode: "json",
    })
      .$type<Record<string, unknown>>()
      .notNull(),
    status: text("status").notNull(),
    requiresConfirmation: integer("requires_confirmation", {
      mode: "boolean",
    }).notNull(),
    sourceMessageId: text("source_message_id"),
    proposedAt: text("proposed_at").notNull(),
    confirmedAt: text("confirmed_at"),
    executedAt: text("executed_at"),
    errorMessage: text("error_message"),
  },
  (table) => ({
    idempotencyIndex: uniqueIndex("action_records_idempotency_idx").on(
      table.idempotencyKey,
    ),
    conversationStatusIndex: index("action_records_conversation_status_idx").on(
      table.conversationId,
      table.status,
    ),
  }),
);

/**
 * Small internal table used by the SQLite migration runner to track applied files.
 */
export const stateStoreMigrationsTable = sqliteTable("state_store_migrations", {
  id: integer("id")
    .primaryKey({
      autoIncrement: true,
    }),
  name: text("name").notNull(),
  appliedAt: text("applied_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});
