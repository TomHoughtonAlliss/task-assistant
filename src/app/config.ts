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
const todoistApiTokenSchema = z.string().min(1);
const todoistApiBaseUrlSchema = z.url();
const disableDailyRunGuardSchema = z.coerce.boolean();
const openAiApiKeySchema = z.string().min(1);
const openAiBaseUrlSchema = z.url();
const openAiModelSchema = z.string().min(1);

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
    DISABLE_DAILY_RUN_GUARD: disableDailyRunGuardSchema.default(false),
    TELEGRAM_RECEIVER_MODE: telegramReceiverModeSchema.default("polling"),
    TODOIST_API_TOKEN: todoistApiTokenSchema.optional(),
    TODOIST_API_BASE_URL: todoistApiBaseUrlSchema.default("https://api.todoist.com/api/v1"),
    OPENAI_API_KEY: openAiApiKeySchema.optional(),
    OPENAI_BASE_URL: openAiBaseUrlSchema.default("https://api.openai.com/v1"),
    OPENAI_MODEL: openAiModelSchema.default("gpt-5.2"),
  })
  .superRefine((parsed, context) => {
    if (parsed.TASK_PROVIDER === "todoist" && !parsed.TODOIST_API_TOKEN) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["TODOIST_API_TOKEN"],
        message: "TODOIST_API_TOKEN is required when TASK_PROVIDER=todoist",
      });
    }

    if (parsed.MODEL_PROVIDER === "openai" && !parsed.OPENAI_API_KEY) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["OPENAI_API_KEY"],
        message: "OPENAI_API_KEY is required when MODEL_PROVIDER=openai",
      });
    }
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
      todoist: {
        apiToken: todoistApiTokenSchema.parse(parsed.TODOIST_API_TOKEN),
        apiBaseUrl: parsed.TODOIST_API_BASE_URL,
      },
      openai: {
        apiKey: openAiApiKeySchema.parse(parsed.OPENAI_API_KEY),
        baseUrl: parsed.OPENAI_BASE_URL,
        model: parsed.OPENAI_MODEL,
      },
    },
    state: {
      directory: parsed.STATE_DIR,
      disableDailyRunGuard: parsed.DISABLE_DAILY_RUN_GUARD,
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
