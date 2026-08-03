import type { InboundMessage } from "../message-channel/index.js";
import type {
  ConversationSummaryRecord,
  MessageRecord,
  SelectionRecord,
  StateStore,
} from "../state-store/index.js";
import type { TaskProvider } from "../task-provider/index.js";
import type { Task } from "../../domain/index.js";
import type { ReplyHandlingContext } from "./types.js";

const recentMessageLimit = 12;

/**
 * Dependencies required to load bounded conversation context for one inbound turn.
 */
export interface ConversationContextLoaderDependencies {
  /**
   * Persistence boundary used to load summaries, selections, and recent messages.
   */
  stateStore: StateStore;
  /**
   * Task boundary used to load the concrete task records referenced by stored context.
   */
  taskProvider: TaskProvider;
}

/**
 * Loads bounded persisted context for one inbound conversational turn.
 */
export class ConversationContextLoader {
  private readonly dependencies: ConversationContextLoaderDependencies;

  /**
   * Creates the bounded conversation-context loader around persistence and task boundaries.
   */
  public constructor(dependencies: ConversationContextLoaderDependencies) {
    this.dependencies = dependencies;
  }

  /**
   * Loads recent persisted context and infers the current task when possible.
   */
  public async load(inboundMessage: InboundMessage): Promise<ReplyHandlingContext> {
    const tasks = await this.loadCurrentTasks();
    const conversationSummary = this.dependencies.stateStore.getConversationSummary(
      inboundMessage.conversationId,
    );
    const recentMessages = this.dependencies.stateStore.listMessagesForConversation(
      inboundMessage.conversationId,
      recentMessageLimit,
    );
    const linkedSelection = this.loadLinkedSelection(inboundMessage, recentMessages);
    const currentTaskId = conversationSummary?.currentTaskId
      ?? linkedSelection?.selection.mainTaskId;
    const relevantTasks = selectRelevantTasks(tasks, currentTaskId, linkedSelection);

    return {
      tasks,
      conversationSummary,
      currentTask: findCurrentTask(relevantTasks, currentTaskId),
      recentMessages,
      relevantTasks,
      linkedSelection,
    };
  }

  /**
   * Loads the selection linked to the replied-to outbound daily message, when available.
   */
  private loadLinkedSelection(
    inboundMessage: InboundMessage,
    recentMessages: MessageRecord[],
  ): SelectionRecord | null {
    if (!inboundMessage.sourceMessageId) {
      return null;
    }

    const sourceMessage = recentMessages.find(
      (message) =>
        message.direction === "outbound"
        && message.messageId === inboundMessage.sourceMessageId,
    );

    if (!sourceMessage?.runId) {
      return null;
    }

    return this.dependencies.stateStore.getSelectionByRunId(sourceMessage.runId);
  }

  /**
   * Loads the full current incomplete task list for model grounding.
   */
  private async loadCurrentTasks(): Promise<Task[]> {
    const taskResult = await this.dependencies.taskProvider.listIncompleteTasks();
    if (!taskResult.ok) {
      return [];
    }

    return taskResult.value;
  }
}

/**
 * Collects the current task plus any linked daily-selection tasks in stable order.
 */
function collectRelevantTaskIds(
  currentTaskId: string | undefined,
  linkedSelection: SelectionRecord | null,
): string[] {
  const taskIds = new Set<string>();

  if (currentTaskId) {
    taskIds.add(currentTaskId);
  }

  if (linkedSelection) {
    taskIds.add(linkedSelection.selection.mainTaskId);
    for (const additionalTaskId of linkedSelection.selection.additionalTaskIds) {
      taskIds.add(additionalTaskId);
    }
  }

  return [...taskIds];
}

/**
 * Selects the small relevant-task subset from the full current task list.
 */
function selectRelevantTasks(
  tasks: Task[],
  currentTaskId: string | undefined,
  linkedSelection: SelectionRecord | null,
): Task[] {
  const relevantTaskIds = new Set(
    collectRelevantTaskIds(currentTaskId, linkedSelection),
  );

  if (relevantTaskIds.size === 0) {
    return [];
  }

  return tasks.filter((task) => relevantTaskIds.has(task.id));
}

/**
 * Finds the loaded current task inside the relevant-task set.
 */
function findCurrentTask(
  relevantTasks: Task[],
  currentTaskId: string | undefined,
): Task | null {
  if (!currentTaskId) {
    return null;
  }

  return relevantTasks.find((task) => task.id === currentTaskId) ?? null;
}
