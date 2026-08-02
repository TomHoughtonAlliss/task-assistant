import type {
  HandleInboundMessageInput,
  HandleInboundMessageResult,
  ReplyHandlingContext,
  ReplyHandlingDependencies,
  ReplyHandlingModelRequest,
  ReplyHandlingPlan,
} from "./types.js";
import type { ConversationReplyRequest } from "../model-provider/index.js";
import type { Task } from "../../domain/index.js";

/**
 * Orchestrates one inbound conversational turn after transport-specific parsing has completed.
 */
export class InboundMessageHandler {
  private readonly dependencies: ReplyHandlingDependencies;

  /**
   * Creates the inbound reply-handling use case around the shared application boundaries.
   */
  public constructor(dependencies: ReplyHandlingDependencies) {
    this.dependencies = dependencies;
  }

  /**
   * Handles one normalized inbound user message.
   */
  public async handle(
    input: HandleInboundMessageInput,
  ): Promise<HandleInboundMessageResult> {
    const context = await this.loadContext(input);
    const modelRequest = this.buildModelRequest(input, context);
    const modelResult = await this.dependencies.modelProvider.generateConversationReply(
      modelRequest,
    );

    if (!modelResult.ok) {
      if ("refusal" in modelResult) {
        return {
          accepted: false,
          error: {
            code: "model_refusal",
            message: modelResult.refusal.reason,
            refusal: modelResult.refusal,
          },
        };
      }

      return {
        accepted: false,
        error: {
          code: "model_provider_failed",
          message: modelResult.error.message,
          cause: modelResult.error,
        },
      };
    }

    const plan: ReplyHandlingPlan = {
      context,
      modelRequest,
      reply: modelResult.value,
      sendPlan: {
        outboundMessage: {
          conversationId: input.inboundMessage.conversationId,
          body: modelResult.value.message,
          replyToMessageId: input.inboundMessage.messageId,
        },
      },
    };

    const messageResult = await this.dependencies.messageChannel.sendMessage({
      body: plan.sendPlan.outboundMessage.body,
      conversationId: plan.sendPlan.outboundMessage.conversationId,
    })
    if (!messageResult.ok) {
      throw new Error(messageResult.error.message);
    }

    return {
      accepted: true,
      plan,
    };
  }

  /**
   * Loads the bounded state needed to ground one conversational turn.
   */
  private async loadContext(
    input: HandleInboundMessageInput,
  ): Promise<ReplyHandlingContext> {
    const conversationSummary = this.dependencies.stateStore.getConversationSummary(
      input.inboundMessage.conversationId,
    );
    const recentMessages = this.dependencies.stateStore.listMessagesForConversation(
      input.inboundMessage.conversationId,
      10,
    );
    const currentTask = await this.loadCurrentTask(conversationSummary?.currentTaskId);

    return {
      conversationSummary,
      currentTask,
      recentMessages,
      relevantTasks: currentTask ? [currentTask] : [],
    };
  }

  /**
   * Loads the current task under discussion when the conversation summary already points to one.
   */
  private async loadCurrentTask(taskId?: string): Promise<Task | null> {
    if (!taskId) {
      return null;
    }

    const taskResult = await this.dependencies.taskProvider.getTaskById(taskId);
    if (!taskResult.ok) {
      return null;
    }

    return taskResult.value;
  }

  /**
   * Builds the model request for one conversational turn from the inbound message and loaded context.
   */
  private buildModelRequest(
    input: HandleInboundMessageInput,
    context: ReplyHandlingContext,
  ): ConversationReplyRequest & ReplyHandlingModelRequest {
    const request: ConversationReplyRequest & ReplyHandlingModelRequest = {
      conversationId: input.inboundMessage.conversationId,
      userMessage: input.inboundMessage.text,
      relevantTasks: context.relevantTasks,
    };

    if (context.currentTask) {
      request.currentTask = context.currentTask;
    }

    if (context.conversationSummary) {
      request.conversationSummary = context.conversationSummary.summary;
    }

    return request;
  }
}
