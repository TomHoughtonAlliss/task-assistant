# Project architecture

Task Assistant is a single-service TypeScript application that runs one scheduled daily-review workflow and one reply-handling workflow.

## Design goals

- keep business logic independent from Fastify, Telegram, Todoist, Drizzle, and Vercel AI SDK types;
- isolate side effects behind narrow interfaces so selection, validation, and ranking logic stay testable;
- persist enough durable state to survive restarts, deduplicate retries, and continue conversations coherently.

## High-level structure

The application should be organised into four layers:

- `domain`: core task, selection, message, and action models plus invariants;
- `application`: use cases such as daily review, reply handling, action validation, and scheduler orchestration;
- `infrastructure`: concrete adapters for SQLite state storage, Todoist, Telegram, and Vercel AI SDK;
- `entrypoints`: HTTP routes, webhook handlers, polling loops, and process startup.

## Key boundaries

The main replaceable interfaces are:

- `TaskProvider`: lists tasks and performs approved task mutations;
- `StateStore`: persists runs, selections, messages, conversation context, and action records;
- `MessageChannel`: sends outbound messages and normalises inbound ones;
- `ModelProvider`: produces structured daily selections, messages, and conversational replies from bounded inputs;
- `Scheduler`: triggers the daily-review use case and relies on the run guard for idempotency.

Core business logic should depend on those interfaces and plain application/domain types only.

## Model layer

Vercel AI SDK is a good fit for the first `ModelProvider` implementation, but it should remain an infrastructure detail.

The intended shape is:

```text
application use cases
  -> ModelProvider interface
    -> VercelAiSdkModelProvider adapter
      -> AI SDK generateObject / generateText
```

This keeps structured-output and provider-switching concerns inside one adapter while letting application code depend on a stable contract. It also keeps room for a later replacement if model choice, hosting, or vendor changes.

## Main workflows

Daily review:

1. Scheduler fires for the user’s local date and time window.
2. Run guard reserves the daily run key.
3. Task provider lists incomplete tasks.
4. Application logic filters and ranks candidates.
5. Model provider chooses the bounded daily selection.
6. Model provider generates the initial daily message contents, using the selection and other prompts.
7. Message is delivered through the message channel.
8. State store records the run, selection, and delivery result.
9. This message begins the conversation for the day.

Reply handling:

1. Message channel receives an inbound user message.
2. Application logic loads bounded conversation context and current task state.
3. Model provider returns a reply plus structured proposed actions.
4. Application logic validates proposed actions and confirmation requirements.
5. Approved actions execute through the task provider with dedupe protection.
6. Follow-up messages and action outcomes are persisted.

## State and idempotency

The state store is responsible for durability across restarts and retries. At minimum it must support:

- one successful daily run per user and local date;
- recent selection history for anti-repetition signals;
- current conversational task and bounded recent context;
- outbound and inbound message correlation;
- proposed, confirmed, rejected, and executed task actions with dedupe keys.

## Transport and framework choices

Fastify, Telegram delivery mode, and Todoist are implementation choices, not architectural roots. They should stay at the edges so the application can evolve without rewriting the core use cases.
