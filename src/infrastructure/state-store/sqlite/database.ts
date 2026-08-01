import { mkdirSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import type { AppConfig } from "../../../app/config.js";

const sqliteFilename = "task-assistant.sqlite";

/**
 * Creates a configured SQLite database connection inside the configured state directory.
 */
export function openStateDatabase(config: AppConfig): Database.Database {
  mkdirSync(config.state.directory, {
    recursive: true,
  });

  const database = new Database(join(config.state.directory, sqliteFilename));
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");

  return database;
}
