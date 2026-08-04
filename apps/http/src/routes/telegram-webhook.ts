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

      // Acknowledge before slow model/provider work. Telegram clients are more reliable about
      // showing `sendChatAction` typing once the webhook has been accepted.
      reply.code(200).send({ accepted: true });

      const typingResult = await telegramChannel.indicateTyping(
        inboundMessage.conversationId,
      );
      if (!typingResult.ok) {
        request.log.warn(
          {
            error: typingResult.error,
            conversationId: inboundMessage.conversationId,
          },
          "Failed to send Telegram typing indicator",
        );
      } else {
        request.log.info(
          {
            conversationId: inboundMessage.conversationId,
          },
          "Sent Telegram typing indicator",
        );
      }

      if (!server.inboundMessageHandler) {
        request.log.warn("No inbound message handler configured");
        return;
      }

      const result = await server.inboundMessageHandler.handle({
        inboundMessage,
      });

      request.log.info(
        {
          accepted: result.accepted,
          conversationId: inboundMessage.conversationId,
        },
        "Completed inbound Telegram handling",
      );
    } catch (error: unknown) {
      if (!reply.sent) {
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

      request.log.error(
        {
          error,
        },
        "Telegram inbound handling failed after webhook acknowledgement",
      );
    }
  });
}
