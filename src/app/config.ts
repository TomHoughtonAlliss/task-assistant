import { z } from "zod";

const providerSchema = z.enum(["todoist"]);
const messageChannelSchema = z.enum(["telegram"]);
const modelProviderSchema = z.enum(["openai"]);
const telegramReceiverModeSchema = z.enum(["polling", "webhook"]);
const hostSchema = z.string();
const portSchema = z.number().int().min(1).max(65535);
const timezoneSchema = z.string();
const localTimeSchema = z.string();
const jitterMinutesSchema = z.number().int().min(0).max(60);
const stateDirectorySchema = z.string().min(1);

const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;

const configSchema = z
  .object({
    APP_HOST: hostSchema.default("0.0.0.0"),
    APP_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    USER_TIMEZONE: timezoneSchema.default("Europe/London"),
    DELIVERY_LOCAL_TIME: localTimeSchema
      .regex(timePattern, "DELIVERY_LOCAL_TIME must be in HH:MM format")
      .default("10:00"),
    DELIVERY_JITTER_MINUTES: z.coerce.number().int().min(0).max(60).default(10),
    TASK_PROVIDER: providerSchema.default("todoist"),
    MESSAGE_CHANNEL: messageChannelSchema.default("telegram"),
    MODEL_PROVIDER: modelProviderSchema.default("openai"),
    STATE_DIR: stateDirectorySchema.default("./data"),
    TELEGRAM_RECEIVER_MODE: telegramReceiverModeSchema.default("polling"),
  })
  .transform((parsed) => ({
    app: {
      host: parsed.APP_HOST,
      port: portSchema.parse(parsed.APP_PORT),
    },
    user: {
      timezone: parsed.USER_TIMEZONE,
    },
    delivery: {
      localTime: parsed.DELIVERY_LOCAL_TIME,
      jitterMinutes: jitterMinutesSchema.parse(parsed.DELIVERY_JITTER_MINUTES),
    },
    integrations: {
      taskProvider: parsed.TASK_PROVIDER,
      messageChannel: parsed.MESSAGE_CHANNEL,
      modelProvider: parsed.MODEL_PROVIDER,
      telegramReceiverMode: parsed.TELEGRAM_RECEIVER_MODE,
    },
    state: {
      directory: parsed.STATE_DIR,
    },
  }));

/**
 * Runtime configuration for the application.
 */
export type AppConfig = z.infer<typeof configSchema>;

/**
 * Loads and validates runtime configuration from environment variables.
 *
 * Throws when required values are invalid so misconfiguration is visible at startup.
 */
export function loadConfig(environment: NodeJS.ProcessEnv): AppConfig {
  return configSchema.parse(environment);
}
