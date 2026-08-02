import { loadEnvFile } from "node:process";
import { buildAppRuntime } from "./runtime.js";
import { loadConfig } from "./config.js";

/**
 * Loads a local `.env` file when present so local development mirrors Docker env-file behavior.
 */
function loadLocalEnvironment(): void {
  try {
    loadEnvFile();
  } catch (error: unknown) {
    if (isMissingEnvironmentFileError(error)) {
      return;
    }

    throw error;
  }
}

/**
 * Returns whether the failed env-file load was caused only by a missing local `.env` file.
 */
function isMissingEnvironmentFileError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

/**
 * Starts the application using validated runtime configuration.
 */
export async function bootstrap(): Promise<void> {
  loadLocalEnvironment();
  const config = loadConfig(process.env);
  const runtime = buildAppRuntime(config);
  runtime.stateStore.migrate();

  await runtime.server.listen({
    host: config.app.host,
    port: config.app.port,
  });

  await runtime.scheduler.start();
}
