import { z } from "zod";

/**
 * Successful Telegram Bot API response returned after sending one message.
 */
export const telegramSendMessageSuccessSchema = z.object({
  ok: z.literal(true),
  result: z.object({
    message_id: z.union([z.number().int(), z.string()]),
    date: z.number().int().nonnegative(),
    chat: z.object({
      id: z.union([z.number().int(), z.string()]),
    }),
  }),
});

/**
 * Successful Telegram Bot API response returned after sending one message.
 */
export type TelegramSendMessageSuccess = z.infer<
  typeof telegramSendMessageSuccessSchema
>;

/**
 * Failed Telegram Bot API response returned after attempting to send one message.
 */
export const telegramSendMessageFailureSchema = z.object({
  ok: z.literal(false),
  error_code: z.number().int(),
  description: z.string().min(1),
  parameters: z
    .object({
      retry_after: z.number().int().positive().optional(),
    })
    .optional(),
});

/**
 * Failed Telegram Bot API response returned after attempting to send one message.
 */
export type TelegramSendMessageFailure = z.infer<
  typeof telegramSendMessageFailureSchema
>;

/**
 * Union schema for Telegram send-message responses.
 */
export const telegramSendMessageResponseSchema = z.union([
  telegramSendMessageSuccessSchema,
  telegramSendMessageFailureSchema,
]);

/**
 * Union type for Telegram send-message responses.
 */
export type TelegramSendMessageResponse = z.infer<
  typeof telegramSendMessageResponseSchema
>;

const telegramUserSchema = z.object({
  id: z.union([z.number().int(), z.string()]),
});

const telegramChatSchema = z.object({
  id: z.union([z.number().int(), z.string()]),
});

const telegramReplyMessageSchema = z.object({
  message_id: z.union([z.number().int(), z.string()]),
});

/**
 * Telegram message payload relevant to inbound plain-text reply handling.
 */
export const telegramInboundMessageSchema = z.object({
  message_id: z.union([z.number().int(), z.string()]),
  date: z.number().int().nonnegative(),
  chat: telegramChatSchema,
  from: telegramUserSchema.optional(),
  text: z.string().optional(),
  reply_to_message: telegramReplyMessageSchema.optional(),
});

/**
 * Telegram message payload relevant to inbound plain-text reply handling.
 */
export type TelegramInboundMessage = z.infer<typeof telegramInboundMessageSchema>;

/**
 * Telegram update payload relevant to inbound message receipt.
 */
export const telegramUpdateSchema = z.object({
  update_id: z.number().int().nonnegative(),
  message: telegramInboundMessageSchema.optional(),
  edited_message: telegramInboundMessageSchema.optional(),
});

/**
 * Telegram update payload relevant to inbound message receipt.
 */
export type TelegramUpdate = z.infer<typeof telegramUpdateSchema>;

/**
 * Telegram `getUpdates` response schema used by polling-based inbound receipt.
 */
export const telegramGetUpdatesResponseSchema = z.union([
  z.object({
    ok: z.literal(true),
    result: z.array(telegramUpdateSchema),
  }),
  z.object({
    ok: z.literal(false),
    error_code: z.number().int(),
    description: z.string().min(1),
    parameters: z
      .object({
        retry_after: z.number().int().positive().optional(),
      })
      .optional(),
  }),
]);

/**
 * Telegram `getUpdates` response schema used by polling-based inbound receipt.
 */
export type TelegramGetUpdatesResponse = z.infer<
  typeof telegramGetUpdatesResponseSchema
>;
