import type {
  InboundMessage,
  MessageChannel,
} from "../message-channel/index.js";

/**
 * How often to refresh Telegram's short-lived typing indicator while work continues.
 *
 * Telegram keeps `sendChatAction` visible for at most ~5 seconds, so refresh inside that window.
 */
const TYPING_REFRESH_INTERVAL_MS = 2_000;

/**
 * Runs one inbound turn while refreshing Telegram's typing chat-action.
 *
 * Per Telegram Bot API `sendChatAction`: the typing status lasts ~5 seconds and is cleared when
 * the bot sends a message.
 *
 * Failure modes:
 * - typing channel failures are ignored so they never block the real reply path.
 */
export async function runWithWorkingIndicator<T>(
  messageChannel: MessageChannel,
  inboundMessage: InboundMessage,
  work: () => Promise<T>,
): Promise<T> {
  const stopTyping = await startTypingPulse(
    messageChannel,
    inboundMessage.conversationId,
  );

  try {
    return await work();
  } finally {
    stopTyping();
  }
}

/**
 * Awaits the first typing pulse, then refreshes it until stopped.
 */
async function startTypingPulse(
  messageChannel: MessageChannel,
  conversationId: InboundMessage["conversationId"],
): Promise<() => void> {
  if (!messageChannel.capabilities.indicateTyping) {
    return () => undefined;
  }

  let stopped = false;

  const pulse = async (): Promise<void> => {
    if (stopped) {
      return;
    }
    await messageChannel.indicateTyping(conversationId);
  };

  await pulse();

  const timer = setInterval(() => {
    void pulse();
  }, TYPING_REFRESH_INTERVAL_MS);

  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
