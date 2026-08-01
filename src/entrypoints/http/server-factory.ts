import Fastify, { type FastifyInstance } from "fastify";
import type { AppConfig } from "../../app/config.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerTelegramWebhookRoutes } from "./routes/telegram-webhook.js";

/**
 * Creates the HTTP server used by external entrypoints.
 */
export function createHttpServer(config: AppConfig): FastifyInstance {
  const server = Fastify({
    logger: true,
  });

  server.decorate("runtimeConfig", config);
  registerHealthRoutes(server);
  if (
    config.integrations.messageChannel === "telegram" &&
    config.integrations.telegramReceiverMode === "webhook"
  ) {
    registerTelegramWebhookRoutes(server);
  }

  return server;
}

declare module "fastify" {
  interface FastifyInstance {
    runtimeConfig: AppConfig;
  }
}
