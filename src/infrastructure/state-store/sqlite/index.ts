import type { AppConfig } from "../../../app/config.js";
import { BetterSqliteStateStore } from "./better-sqlite-state-store.js";
import { openStateDatabase } from "./database.js";

export { BetterSqliteStateStore } from "./better-sqlite-state-store.js";
export { applySqliteMigrations } from "./migrate.js";
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
 * Creates a SQLite-backed state store from validated runtime configuration.
 */
export function createSqliteStateStore(config: AppConfig): BetterSqliteStateStore {
  return new BetterSqliteStateStore(openStateDatabase(config));
}
