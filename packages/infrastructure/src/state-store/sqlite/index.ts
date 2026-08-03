import { BetterSqliteStateStore } from "./better-sqlite-state-store.js";
import {
  openStateDatabase,
  type SqliteDatabaseConfig,
} from "./database.js";

export { BetterSqliteStateStore } from "./better-sqlite-state-store.js";
export { applySqliteMigrations } from "./migrate.js";
export type { SqliteDatabaseConfig } from "./database.js";
export {
  actionRecordsTable,
  conversationSummariesTable,
  dailyRunsTable,
  messagesTable,
  selectionsTable,
  snoozesTable,
  stateStoreMigrationsTable,
} from "./schema.js";

/**
 * Creates a SQLite-backed state store from adapter configuration.
 */
export function createSqliteStateStore(
  config: SqliteDatabaseConfig,
): BetterSqliteStateStore {
  return new BetterSqliteStateStore(openStateDatabase(config));
}
