import type { AppConfig } from "../../../app/config.js";
import { TodoistTaskProvider, type TodoistTaskProviderConfig } from "./todoist-task-provider.js";

export { TodoistTaskProvider } from "./todoist-task-provider.js";
export type { TodoistFetch, TodoistTaskProviderConfig } from "./todoist-task-provider.js";

/**
 * Creates a Todoist task provider from validated runtime configuration.
 */
export function createTodoistTaskProvider(config: AppConfig): TodoistTaskProvider {
  const providerConfig: TodoistTaskProviderConfig = {
    apiToken: config.integrations.todoist.apiToken,
    apiBaseUrl: config.integrations.todoist.apiBaseUrl,
  };

  return new TodoistTaskProvider(providerConfig);
}
