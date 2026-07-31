import type { FastifyInstance } from "fastify";

/**
 * Registers the basic healthcheck route used for local and container verification.
 */
export function registerHealthRoutes(server: FastifyInstance): void {
  server.get("/health", async () => {
    return {
      status: "ok",
      timezone: server.runtimeConfig.user.timezone,
      taskProvider: server.runtimeConfig.integrations.taskProvider,
      messageChannel: server.runtimeConfig.integrations.messageChannel,
    };
  });
}

