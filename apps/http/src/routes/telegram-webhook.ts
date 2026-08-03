import type { FastifyInstance } from "fastify";
import { createTelegramMessageChannel } from "@task-assistant/infrastructure/message-channel/telegram";

/**
 * Registers the Telegram webhook route used to normalize inbound replies into the shared app shape.
 */
export function registerTelegramWebhookRoutes(server: FastifyInstance): void {
  const telegram = server.runtimeConfig.integrations.telegram;
  const telegramChannel = createTelegramMessageChannel({
    botToken: telegram.botToken,
    chatId: telegram.chatId,
    apiBaseUrl: telegram.apiBaseUrl,
  });

  server.post("/telegram/webhook", async (request, reply) => {
    try {
      const inboundMessage = telegramChannel.parseWebhookUpdate(request.body);

      if (!inboundMessage) {
        return reply.code(400).send({
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
        return reply.code(404).send({
          accepted: true,
          message: inboundMessage,
          reason: "no_inbound_handler",
        });
      }

      const result = await server.inboundMessageHandler.handle({
        inboundMessage,
      });

      return reply.code(200).send({
        ...result,
      });
    } catch (error: unknown) {
      request.log.warn(
        {
          error,
        },
        "Ignored malformed Telegram webhook payload",
      );

      return reply.code(400).send({
        accepted: false,
        reason: "malformed_payload",
      });
    }
  });
}
