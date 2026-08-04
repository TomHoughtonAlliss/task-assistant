import { ConversationContextLoader } from "./conversation-context-loader.js";
import { ConversationContextTracker } from "./conversation-context-tracker.js";
import { ResetConversationHandler } from "./reset-conversation-handler.js";
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
import {
  appendActionOutcomeNotes,
  processProposedActions,
  resolvePendingActions,
} from "../task-actions/index.js";
import type { ConversationReply } from "@task-assistant/domain";

/**
 * Orchestrates one inbound conversational turn after transport-specific parsing has completed.
 */
export class InboundMessageHandler {
  private readonly dependencies: ReplyHandlingDependencies;
  private readonly contextLoader: ConversationContextLoader;
  private readonly contextTracker: ConversationContextTracker;
  private readonly resetConversationHandler: ResetConversationHandler;

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
    this.resetConversationHandler = new ResetConversationHandler({
      stateStore: dependencies.stateStore,
      messageChannel: dependencies.messageChannel,
      dailyReviewRunner: dependencies.dailyReviewRunner,
      timezone: dependencies.timezone,
    });
  }

  /**
   * Handles one normalized inbound user message.
   *
   * Failure modes:
   * - forwards reset failures as `reset_failed`;
   * - forwards model refusals and provider failures unchanged;
   * - returns `message_delivery_failed` when the outbound channel cannot send.
   */
  public async handle(
    input: HandleInboundMessageInput,
  ): Promise<HandleInboundMessageResult> {
    if (isResetCommand(input.inboundMessage.text)) {
      try {
        await this.resetConversationHandler.handle(input.inboundMessage);
      } catch (error: unknown) {
        return {
          accepted: false,
          error: {
            code: "reset_failed",
            message: error instanceof Error ? error.message : String(error),
          },
        };
      }

      return {
        accepted: true,
        plan: {
          context: {
            tasks: [],
            conversationSummary: null,
            currentTask: null,
            recentMessages: [],
            relevantTasks: [],
            linkedSelection: null,
          },
          modelRequest: {
            conversationId: input.inboundMessage.conversationId,
            tasks: [],
            userMessage: input.inboundMessage.text,
            relevantTasks: [],
          },
          reply: {
            message: "Conversation reset.",
            proposedActions: [],
            currentTaskId: null,
          },
          sendPlan: {
            outboundMessage: {
              conversationId: input.inboundMessage.conversationId,
              body: "Conversation reset.",
            },
          },
        },
      };
    }

    const context = await this.contextLoader.load(input.inboundMessage);
    const pendingResolution = await resolvePendingActions(
      {
        taskProvider: this.dependencies.taskProvider,
        stateStore: this.dependencies.stateStore,
      },
      {
        conversationId: input.inboundMessage.conversationId,
        userMessage: input.inboundMessage.text,
        occurredAt: input.inboundMessage.occurredAt,
      },
    );

    if (
      pendingResolution.decision !== "none" &&
      pendingResolution.acknowledgement
    ) {
      return this.sendAndRecord({
        input,
        context,
        reply: {
          message: pendingResolution.acknowledgement,
          proposedActions: [],
          currentTaskId: context.currentTask?.id ?? null,
        },
        modelRequest: this.buildModelRequest(input, context),
      });
    }

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

    const actionResult = await processProposedActions(
      {
        taskProvider: this.dependencies.taskProvider,
        stateStore: this.dependencies.stateStore,
      },
      {
        conversationId: input.inboundMessage.conversationId,
        sourceMessageId: input.inboundMessage.messageId,
        tasks: context.tasks,
        proposedActions: modelResult.value.proposedActions,
        occurredAt: input.inboundMessage.occurredAt,
      },
    );

    const reply: ConversationReply = {
      ...modelResult.value,
      message: appendActionOutcomeNotes(
        modelResult.value.message,
        actionResult,
      ),
    };

    return this.sendAndRecord({
      input,
      context,
      reply,
      modelRequest,
    });
  }

  /**
   * Sends one outbound reply and persists the conversational turn when delivery succeeds.
   */
  private async sendAndRecord(input: {
    input: HandleInboundMessageInput;
    context: ReplyHandlingContext;
    reply: ConversationReply;
    modelRequest: ReplyHandlingModelRequest;
  }): Promise<HandleInboundMessageResult> {
    const plan: ReplyHandlingPlan = {
      context: input.context,
      modelRequest: input.modelRequest,
      reply: input.reply,
      sendPlan: {
        outboundMessage: {
          conversationId: input.input.inboundMessage.conversationId,
          body: input.reply.message,
          replyToMessageId: input.input.inboundMessage.messageId,
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
      inboundMessage: input.input.inboundMessage,
      context: input.context,
      reply: input.reply,
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
      tasks: context.tasks,
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

/**
 * Returns whether the inbound message is the exact reset command.
 */
function isResetCommand(text: string): boolean {
  return text.trim() === "/reset";
}
