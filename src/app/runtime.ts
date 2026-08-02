import { DailyReviewRunner } from "../application/daily-review/index.js";
import { DailyRunGuard } from "../application/daily-run-guard/index.js";
import { DailyReviewPersistence } from "../application/daily-review-persistence/index.js";
import { InboundMessageHandler } from "../application/reply-handling/index.js";
import type { MessageChannel } from "../application/message-channel/index.js";
import type { ModelProvider } from "../application/model-provider/index.js";
import { DailyScheduler, type Scheduler } from "../application/scheduler/index.js";
import type { StateStore } from "../application/state-store/index.js";
import type { TaskProvider } from "../application/task-provider/index.js";
import { createHttpServer } from "../entrypoints/http/server-factory.js";
import { TelegramMessageChannel } from "../infrastructure/message-channel/telegram/index.js";
import { VercelAiSdkOpenAiModelProvider } from "../infrastructure/model-provider/openai/index.js";
import { createSqliteStateStore } from "../infrastructure/state-store/sqlite/index.js";
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
  const stateStore = createSqliteStateStore(config);
  const aiProvider = new VercelAiSdkOpenAiModelProvider({
    apiKey: config.integrations.openai.apiKey,
    baseUrl: config.integrations.openai.baseUrl,
    model: config.integrations.openai.model,
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
