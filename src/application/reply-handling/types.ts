import type { ConversationReply, Task } from "../../domain/index.js";
import type { MessageChannel } from "../message-channel/index.js";
import type { InboundMessage, OutboundMessage } from "../message-channel/index.js";
import type { ModelProvider, ModelProviderError, ModelProviderRefusal } from "../model-provider/index.js";
import type {
  ConversationSummaryRecord,
  MessageRecord,
  StateStore,
} from "../state-store/index.js";
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
 * Loaded bounded context used to ground one conversational turn.
 */
export interface ReplyHandlingContext {
  /**
   * Persisted conversation summary, when one already exists.
   */
  conversationSummary: ConversationSummaryRecord | null;
  /**
   * Optional current task that the conversation is already focused on.
   */
  currentTask: Task | null;
  /**
   * Small recent message window used for correlation or future summarization.
   */
  recentMessages: MessageRecord[];
  /**
   * Small task set relevant to the current turn.
   */
  relevantTasks: Task[];
}

/**
 * Model request assembled for one conversational turn after context loading.
 */
export interface ReplyHandlingModelRequest {
  /**
   * Conversation identifier used for persistence and model context.
   */
  conversationId: string;
  /**
   * User message to answer.
   */
  userMessage: string;
  /**
   * Optional current task under discussion.
   */
  currentTask?: Task;
  /**
   * Relevant tasks supplied to the model.
   */
  relevantTasks: Task[];
  /**
   * Optional bounded stored conversation summary.
   */
  conversationSummary?: string;
}

/**
 * Follow-up send plan assembled from the model reply and inbound message.
 */
export interface ReplyHandlingSendPlan {
  /**
   * Channel-agnostic outbound follow-up message.
   */
  outboundMessage: OutboundMessage;
}

/**
 * Intermediate orchestration result after the model reply has been generated.
 */
export interface ReplyHandlingPlan {
  /**
   * Loaded context used for this turn.
   */
  context: ReplyHandlingContext;
  /**
   * Model request assembled from the inbound message and loaded context.
   */
  modelRequest: ReplyHandlingModelRequest;
  /**
   * Structured conversational reply returned by the model.
   */
  reply: ConversationReply;
  /**
   * Outbound follow-up send plan derived from the reply.
   */
  sendPlan: ReplyHandlingSendPlan;
}

/**
 * Stable failure category for inbound reply handling.
 */
export type ReplyHandlingErrorCode =
  | "model_refusal"
  | "model_provider_failed"
  | "unsupported_message"
  | "not_implemented";

/**
 * Normalized failure surfaced by the reply-handling orchestration layer.
 */
export interface ReplyHandlingError {
  /**
   * Stable application-facing failure category.
   */
  code: ReplyHandlingErrorCode;
  /**
   * Human-readable failure message suitable for logs and debugging.
   */
  message: string;
  /**
   * Optional underlying model-provider error when the failure came from that boundary.
   */
  cause?: ModelProviderError;
  /**
   * Optional underlying refusal when the model declined to answer.
   */
  refusal?: ModelProviderRefusal;
}

/**
 * High-level outcome returned after handling one inbound message.
 */
export type HandleInboundMessageResult =
  | {
      accepted: true;
      plan: ReplyHandlingPlan;
    }
  | {
      accepted: false;
      error: ReplyHandlingError;
    };
