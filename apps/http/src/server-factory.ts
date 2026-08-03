import Fastify, { type FastifyInstance } from "fastify";
import type { InboundMessageHandler } from "@task-assistant/application/reply-handling";
import type { AppConfig } from "./config.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerTelegramWebhookRoutes } from "./routes/telegram-webhook.js";

/**
 * Optional application handlers that HTTP routes may delegate to.
 */
export interface HttpServerHandlers {
  /**
   * Application-level conversational turn handler for normalized inbound messages.
   */
  inboundMessageHandler?: InboundMessageHandler;
}

/**
 * Creates the HTTP server used by external entrypoints.
 */
export function createHttpServer(
  config: AppConfig,
  handlers: HttpServerHandlers = {},
): FastifyInstance {
  const server = Fastify({
    logger: true,
  });

  server.decorate("runtimeConfig", config);
  server.decorate("inboundMessageHandler", handlers.inboundMessageHandler);
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
    inboundMessageHandler?: InboundMessageHandler;
  }
}
