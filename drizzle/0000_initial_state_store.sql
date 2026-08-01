CREATE TABLE IF NOT EXISTS daily_runs (
  id TEXT PRIMARY KEY NOT NULL,
  user_key TEXT NOT NULL,
  run_key TEXT NOT NULL,
  local_date TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  last_error_message TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS daily_runs_run_key_idx
  ON daily_runs (run_key);

CREATE UNIQUE INDEX IF NOT EXISTS daily_runs_user_date_idx
  ON daily_runs (user_key, local_date);

CREATE TABLE IF NOT EXISTS selections (
  id TEXT PRIMARY KEY NOT NULL,
  run_id TEXT NOT NULL REFERENCES daily_runs(id) ON DELETE CASCADE,
  main_task_id TEXT NOT NULL,
  additional_task_ids TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS selections_run_id_idx
  ON selections (run_id);

CREATE INDEX IF NOT EXISTS selections_main_task_id_idx
  ON selections (main_task_id);

CREATE TABLE IF NOT EXISTS snoozes (
  id TEXT PRIMARY KEY NOT NULL,
  task_id TEXT NOT NULL,
  snoozed_until TEXT NOT NULL,
  reason TEXT,
  source TEXT,
  created_at TEXT NOT NULL,
  cleared_at TEXT
);

CREATE INDEX IF NOT EXISTS snoozes_task_until_idx
  ON snoozes (task_id, snoozed_until);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY NOT NULL,
  direction TEXT NOT NULL,
  channel TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  source_message_id TEXT,
  run_id TEXT REFERENCES daily_runs(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL,
  retry_count INTEGER NOT NULL DEFAULT 0,
  occurred_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS messages_channel_message_idx
  ON messages (channel, message_id);

CREATE INDEX IF NOT EXISTS messages_conversation_occurred_idx
  ON messages (conversation_id, occurred_at);

CREATE TABLE IF NOT EXISTS conversation_summaries (
  id TEXT PRIMARY KEY NOT NULL,
  conversation_id TEXT NOT NULL,
  current_task_id TEXT,
  summary TEXT NOT NULL,
  last_inbound_message_id TEXT,
  last_outbound_message_id TEXT,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS conversation_summaries_conversation_idx
  ON conversation_summaries (conversation_id);

CREATE TABLE IF NOT EXISTS action_records (
  id TEXT PRIMARY KEY NOT NULL,
  idempotency_key TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  task_id TEXT,
  action_type TEXT NOT NULL,
  action_payload TEXT NOT NULL,
  status TEXT NOT NULL,
  requires_confirmation INTEGER NOT NULL,
  source_message_id TEXT,
  proposed_at TEXT NOT NULL,
  confirmed_at TEXT,
  executed_at TEXT,
  error_message TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS action_records_idempotency_idx
  ON action_records (idempotency_key);

CREATE INDEX IF NOT EXISTS action_records_conversation_status_idx
  ON action_records (conversation_id, status);
