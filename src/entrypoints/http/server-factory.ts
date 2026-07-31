import Fastify, { type FastifyInstance } from "fastify";
import type { AppConfig } from "../../app/config.js";
import { registerHealthRoutes } from "./routes/health.js";

/**
 * Creates the HTTP server used by external entrypoints.
 */
export function createHttpServer(config: AppConfig): FastifyInstance {
  const server = Fastify({
    logger: true,
  });

  server.decorate("runtimeConfig", config);
  registerHealthRoutes(server);

  return server;
}

declare module "fastify" {
  interface FastifyInstance {
    runtimeConfig: AppConfig;
  }
}

