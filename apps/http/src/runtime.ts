import { DailyReviewRunner } from "@task-assistant/application/daily-review";
import { DailyRunGuard } from "@task-assistant/application/daily-run-guard";
import { DailyReviewPersistence } from "@task-assistant/application/daily-review-persistence";
import { InboundMessageHandler } from "@task-assistant/application/reply-handling";
import type { MessageChannel } from "@task-assistant/application/message-channel";
import type { ModelProvider } from "@task-assistant/application/model-provider";
import {
  DailyScheduler,
  type Scheduler,
} from "@task-assistant/application/scheduler";
import type { StateStore } from "@task-assistant/application/state-store";
import type { TaskProvider } from "@task-assistant/application/task-provider";
import { TelegramMessageChannel } from "@task-assistant/infrastructure/message-channel/telegram";
import { VercelAiSdkOpenAiModelProvider } from "@task-assistant/infrastructure/model-provider/openai";
import { createSqliteStateStore } from "@task-assistant/infrastructure/state-store/sqlite";
import { TodoistTaskProvider } from "@task-assistant/infrastructure/task-provider/todoist";
import type { AppConfig } from "./config.js";
import { createHttpServer } from "./server-factory.js";

/**
 * Application runtime dependencies created during bootstrap.
 */
export interface AppRuntime {
  server: ReturnType<typeof createHttpServer>;
  aiProvider: ModelProvider;
  messageProvider: MessageChannel;
  taskProvider: TaskProvider;
  stateStore: StateStore;
  dailyRunGuard: DailyRunGuard;
  dailyReviewPersistence: DailyReviewPersistence;
  dailyReviewRunner: DailyReviewRunner;
  inboundMessageHandler: InboundMessageHandler;
  scheduler: Scheduler;
}

/**
 * Wires runtime components together from validated configuration.
 */
export function buildAppRuntime(config: AppConfig): AppRuntime {
  const stateStore = createSqliteStateStore({
    directory: config.state.directory,
  });
  const aiProvider = new VercelAiSdkOpenAiModelProvider({
    apiKey: config.integrations.openai.apiKey,
    baseUrl: config.integrations.openai.baseUrl,
    model: config.integrations.openai.model,
    toneOfVoicePrompt: config.integrations.openai.toneOfVoicePrompt,
  });
  const messageProvider = new TelegramMessageChannel({
    apiBaseUrl: config.integrations.telegram.apiBaseUrl,
    botToken: config.integrations.telegram.botToken,
    chatId: config.integrations.telegram.chatId,
  });
  const taskProvider = new TodoistTaskProvider({
    apiBaseUrl: config.integrations.todoist.apiBaseUrl,
    apiToken: config.integrations.todoist.apiToken,
  });
  const dailyRunGuard = new DailyRunGuard(stateStore, {
    disabled: config.state.disableDailyRunGuard,
  });
  const dailyReviewPersistence = new DailyReviewPersistence(
    stateStore,
    dailyRunGuard,
  );
  const dailyReviewRunner = new DailyReviewRunner({
    taskProvider,
    modelProvider: aiProvider,
    messageChannel: messageProvider,
    stateStore,
    runGuard: dailyRunGuard,
    persistence: dailyReviewPersistence,
  });
  const inboundMessageHandler = new InboundMessageHandler({
    modelProvider: aiProvider,
    messageChannel: messageProvider,
    taskProvider,
    stateStore,
    dailyReviewRunner,
    timezone: config.user.timezone,
  });
  const scheduler = new DailyScheduler(
    dailyRunGuard,
    async (input) => {
      await dailyReviewRunner.run(input);
    },
    {
      userKey: config.integrations.telegram.chatId,
      timezone: config.user.timezone,
      localTime: config.delivery.localTime,
      jitterMinutes: config.delivery.jitterMinutes,
    },
  );

  return {
    server: createHttpServer(config, {
      inboundMessageHandler,
    }),
    aiProvider,
    messageProvider,
    taskProvider,
    stateStore,
    dailyRunGuard,
    dailyReviewPersistence,
    dailyReviewRunner,
    inboundMessageHandler,
    scheduler,
  };
}
