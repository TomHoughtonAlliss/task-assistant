import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type Database from "better-sqlite3";

const packageRootDirectory = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const migrationsDirectory = join(packageRootDirectory, "drizzle");

/**
 * Raw row shape returned when listing applied SQLite migration names.
 */
interface AppliedMigrationRow {
  name: string;
}

/**
 * Applies pending SQL migration files shipped with the infrastructure package.
 */
export function applySqliteMigrations(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS state_store_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const appliedMigrationRows = database
    .prepare("SELECT name FROM state_store_migrations")
    .all() as AppliedMigrationRow[];
  const appliedMigrationNames = new Set<string>(
    appliedMigrationRows.map((row) => row.name),
  );
  const migrationFiles = readdirSync(migrationsDirectory)
    .filter((filename) => filename.endsWith(".sql"))
    .sort();

  const insertMigration = database.prepare(
    "INSERT INTO state_store_migrations (name) VALUES (?)",
  );

  for (const migrationFile of migrationFiles) {
    if (appliedMigrationNames.has(migrationFile)) {
      continue;
    }

    const migrationSql = readFileSync(
      join(migrationsDirectory, migrationFile),
      "utf8",
    );

    const transaction = database.transaction(() => {
      database.exec(migrationSql);
      insertMigration.run(migrationFile);
    });

    transaction();
  }
}
