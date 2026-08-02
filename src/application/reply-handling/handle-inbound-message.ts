import type {
  HandleInboundMessageInput,
  HandleInboundMessageResult,
  ReplyHandlingDependencies,
} from "./types.js";

/**
 * Orchestrates one inbound conversational turn after transport-specific parsing has completed.
 *
 * This is intentionally scaffold-level for now: it gives runtime wiring one clear application
 * entrypoint for inbound messages while the downstream context loading, model reply generation,
 * action validation, execution, and persistence steps are filled in later tasks.
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
   *
   * Planned steps:
   * 1. persist or correlate the inbound message
   * 2. load bounded conversation context and current task state
   * 3. ask the model for a conversational reply and proposed actions
   * 4. validate any proposed actions
   * 5. execute confirmed actions where appropriate
   * 6. send and persist the follow-up outbound reply
   */
  public async handle(
    _input: HandleInboundMessageInput,
  ): Promise<HandleInboundMessageResult> {
    void this.dependencies;

    throw new Error(
      "InboundMessageHandler.handle is scaffolded but not implemented yet",
    );
  }
}
