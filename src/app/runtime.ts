import { createHttpServer } from "../entrypoints/http/server-factory.js";
import type { AppConfig } from "./config.js";

/**
 * Application runtime dependencies created during bootstrap.
 */
export interface AppRuntime {
  server: ReturnType<typeof createHttpServer>;
}

/**
 * Wires runtime components together from validated configuration.
 */
export function buildAppRuntime(config: AppConfig): AppRuntime {
  return {
    server: createHttpServer(config),
  };
}
