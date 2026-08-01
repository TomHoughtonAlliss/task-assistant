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
