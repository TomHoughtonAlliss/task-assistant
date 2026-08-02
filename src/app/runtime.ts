import { MessageChannel } from "../application/message-channel/index.js";
import { ModelProvider } from "../application/model-provider/index.js";
import { TaskProvider } from "../application/task-provider/index.js";
import { createHttpServer } from "../entrypoints/http/server-factory.js";
import { TelegramMessageChannel } from "../infrastructure/message-channel/telegram/index.js";
import { VercelAiSdkOpenAiModelProvider } from "../infrastructure/model-provider/openai/index.js";
import { TodoistTaskProvider } from "../infrastructure/task-provider/todoist/index.js";
import type { AppConfig } from "./config.js";

/**
 * Application runtime dependencies created during bootstrap.
 */
export interface AppRuntime {
  server: ReturnType<typeof createHttpServer>;
  aiProvider: ModelProvider;
  messageProvider: MessageChannel;
  taskProvider: TaskProvider;
}

/**
 * Wires runtime components together from validated configuration.
 */
export function buildAppRuntime(config: AppConfig): AppRuntime {
  return {
    server: createHttpServer(config),
    aiProvider: new VercelAiSdkOpenAiModelProvider({
      apiKey: config.integrations.openai.apiKey,
      baseUrl: config.integrations.openai.baseUrl,
      model: config.integrations.openai.model,
    }),
    messageProvider: new TelegramMessageChannel({
      apiBaseUrl: config.integrations.telegram.apiBaseUrl,
      botToken: config.integrations.telegram.botToken,
      chatId: config.integrations.telegram.chatId,
    }),
    taskProvider: new TodoistTaskProvider({
      apiBaseUrl: config.integrations.todoist.apiBaseUrl,
      apiToken: config.integrations.todoist.apiToken,
    }),
  };
}
