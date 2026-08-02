import { mkdirSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";

const sqliteFilename = "task-assistant.sqlite";

/**
 * Configuration required to open the SQLite state-store database file.
 */
export interface SqliteDatabaseConfig {
  /**
   * Directory that should contain the SQLite database file.
   */
  directory: string;
}

/**
 * Creates a configured SQLite database connection inside the configured state directory.
 */
export function openStateDatabase(config: SqliteDatabaseConfig): Database.Database {
  mkdirSync(config.directory, {
    recursive: true,
  });

  const database = new Database(join(config.directory, sqliteFilename));
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");

  return database;
}
