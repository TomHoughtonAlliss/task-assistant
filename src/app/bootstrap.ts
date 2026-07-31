import { buildAppRuntime } from "./runtime.js";
import { loadConfig } from "./config.js";

/**
 * Starts the application using validated runtime configuration.
 */
export async function bootstrap(): Promise<void> {
  const config = loadConfig(process.env);
  const runtime = buildAppRuntime(config);

  await runtime.server.listen({
    host: config.app.host,
    port: config.app.port,
  });
}

