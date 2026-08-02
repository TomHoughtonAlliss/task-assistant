import type { MessageChannel } from "../message-channel/index.js";
import type { InboundMessage } from "../message-channel/index.js";
import type { ModelProvider } from "../model-provider/index.js";
import type { StateStore } from "../state-store/index.js";
import type { TaskProvider } from "../task-provider/index.js";

/**
 * Dependency bundle required by the reply-handling orchestration use case.
 */
export interface ReplyHandlingDependencies {
  /**
   * Model boundary used to generate task-focused replies and structured proposed actions.
   */
  modelProvider: ModelProvider;
  /**
   * Message channel used to send follow-up conversational replies.
   */
  messageChannel: MessageChannel;
  /**
   * Task-system boundary used for any later validated task mutations.
   */
  taskProvider: TaskProvider;
  /**
   * Persistence boundary used to load and save message/context state.
   */
  stateStore: StateStore;
}

/**
 * Input passed to the inbound-reply orchestration use case.
 */
export interface HandleInboundMessageInput {
  /**
   * Normalized inbound message already parsed from the transport-specific payload.
   */
  inboundMessage: InboundMessage;
}

/**
 * High-level outcome returned after handling one inbound message.
 */
export interface HandleInboundMessageResult {
  /**
   * Whether the inbound message was accepted into the conversational pipeline.
   */
  accepted: boolean;
}
