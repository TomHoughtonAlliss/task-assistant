import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit configuration for the local SQLite state-store schema.
 */
export default defineConfig({
  schema: "./src/infrastructure/state-store/sqlite/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: "./data/task-assistant.sqlite",
  },
});
