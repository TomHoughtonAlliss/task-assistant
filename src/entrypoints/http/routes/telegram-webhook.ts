import type { FastifyInstance } from "fastify";
import { createTelegramMessageChannel } from "../../../infrastructure/message-channel/telegram/index.js";

/**
 * Registers the Telegram webhook route used to normalize inbound replies into the shared app shape.
 */
export function registerTelegramWebhookRoutes(server: FastifyInstance): void {
  const telegramChannel = createTelegramMessageChannel(server.runtimeConfig);

  server.post("/telegram/webhook", async (request, reply) => {
    try {
      const inboundMessage = telegramChannel.parseWebhookUpdate(request.body);

      if (!inboundMessage) {
        return reply.code(202).send({
          accepted: false,
          reason: "unsupported_update",
        });
      }

      request.log.info(
        {
          channel: inboundMessage.channel,
          conversationId: inboundMessage.conversationId,
          messageId: inboundMessage.messageId,
          senderId: inboundMessage.senderId,
        },
        "Normalized inbound Telegram message",
      );

      if (!server.inboundMessageHandler) {
        return reply.code(202).send({
          accepted: true,
          message: inboundMessage,
          reason: "no_inbound_handler",
        });
      }

      const result = await server.inboundMessageHandler.handle({
        inboundMessage,
      });

      return reply.code(202).send({
        ...result,
      });
    } catch (error: unknown) {
      request.log.warn(
        {
          error,
        },
        "Ignored malformed Telegram webhook payload",
      );

      return reply.code(202).send({
        accepted: false,
        reason: "malformed_payload",
      });
    }
  });
}
