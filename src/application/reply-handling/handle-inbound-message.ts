import { ConversationContextLoader } from "./conversation-context-loader.js";
import { ConversationContextTracker } from "./conversation-context-tracker.js";
import type { OutboundMessage } from "../message-channel/index.js";
import type {
  HandleInboundMessageInput,
  HandleInboundMessageResult,
  ReplyHandlingContext,
  ReplyHandlingDependencies,
  ReplyHandlingModelRequest,
  ReplyHandlingPlan,
} from "./types.js";
import type { ConversationReplyRequest } from "../model-provider/index.js";

/**
 * Orchestrates one inbound conversational turn after transport-specific parsing has completed.
 */
export class InboundMessageHandler {
  private readonly dependencies: ReplyHandlingDependencies;
  private readonly contextLoader: ConversationContextLoader;
  private readonly contextTracker: ConversationContextTracker;

  /**
   * Creates the inbound reply-handling use case around the shared application boundaries.
   */
  public constructor(dependencies: ReplyHandlingDependencies) {
    this.dependencies = dependencies;
    this.contextLoader = new ConversationContextLoader({
      stateStore: dependencies.stateStore,
      taskProvider: dependencies.taskProvider,
    });
    this.contextTracker = new ConversationContextTracker({
      stateStore: dependencies.stateStore,
    });
  }

  /**
   * Handles one normalized inbound user message.
   */
  public async handle(
    input: HandleInboundMessageInput,
  ): Promise<HandleInboundMessageResult> {
    const context = await this.contextLoader.load(input.inboundMessage);
    const modelRequest = this.buildModelRequest(input, context);
    console.dir(modelRequest);
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

    const outboundMessage: OutboundMessage = {
      body: plan.sendPlan.outboundMessage.body,
      conversationId: plan.sendPlan.outboundMessage.conversationId,
    };
    if (plan.sendPlan.outboundMessage.replyToMessageId) {
      outboundMessage.replyToMessageId = plan.sendPlan.outboundMessage.replyToMessageId;
    }
    const messageResult = await this.dependencies.messageChannel.sendMessage(
      outboundMessage,
    );
    if (!messageResult.ok) {
      return {
        accepted: false,
        error: {
          code: "message_delivery_failed",
          message: messageResult.error.message,
        },
      };
    }

    this.contextTracker.recordTurn({
      inboundMessage: input.inboundMessage,
      context,
      reply: modelResult.value,
      outboundMessage: plan.sendPlan.outboundMessage,
      delivery: messageResult,
    });

    return {
      accepted: true,
      plan,
    };
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
