import {
  TodoistTaskProvider,
  type TodoistTaskProviderConfig,
} from "./todoist-task-provider.js";

export { TodoistTaskProvider } from "./todoist-task-provider.js";
export type {
  TodoistFetch,
  TodoistTaskProviderConfig,
} from "./todoist-task-provider.js";

/**
 * Creates a Todoist task provider from adapter configuration.
 */
export function createTodoistTaskProvider(
  config: TodoistTaskProviderConfig,
): TodoistTaskProvider {
  return new TodoistTaskProvider(config);
}
