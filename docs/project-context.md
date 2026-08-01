# Project context

## Summary

Task Assistant is a personal daily task-reminder companion.

The user keeps an ordinary to-do list in an external task system. Once per day, currently envisioned around 10:00 in the user's local timezone, the companion reviews all incomplete tasks and selects the one that is most worthwhile to complete that day.

It then sends a short message through a personal messaging channel. The desired experience is closer to a considerate person gently nudging the user than to opening a productivity dashboard.

Example input:

- Book eye test
- Clean oven
- Call Mum
- Reply to email — due tomorrow

Example output:

> Hi Tom, it's probably a good time to book the eye test, otherwise getting an appointment may slip by another couple of weeks. Also, do not forget the email needs sorting by tomorrow.

The exact wording should vary and should be based on the current tasks rather than a fixed template.

## User and locale

The initial user is Tom.

Defaults:

- timezone: `Europe/London`;
- language: British English;
* preferred delivery time: 10:00 with some random wiggle room, to simulate human behaviour;
- communication style: brief, friendly, specific, and low-pressure.

The system should not infer facts that are not present in the task data or stored history. For example, it should not invent how old an item is, how long a user has owned something, or the consequences of delay without evidence.

## Core problem

A normal reminder system massively benefits from a third party encouraging the user to complete their tasks - but without any third party the user must be consistently proactive and hold themselves to a high standard, which is very difficult. This assistant will, in a way, mother the user and gently encourage them to get things done.

This companion instead performs a lightweight daily judgement:

- What is urgent?
- What has been neglected?
- What is easy enough to make progress on today?
- What will become harder if delayed?
- What unlocks something else?
- What has already been suggested recently?

The output should reduce choice paralysis, not reproduce the entire task list.

## Functional requirements

### Daily review

At the configured time, the system should:

1. Retrieve incomplete tasks.
2. Exclude tasks that are snoozed or otherwise ineligible.
3. Rank candidates.
4. Select one main task.
5. Optionally identify a small number of deadline-critical tasks.
6. Generate a concise message.
7. Deliver it through the configured messaging channel.
8. Record the decision and delivery result.

### Selection quality

The ranking should account for:

- overdue tasks;
- tasks due soon;
- consequences of delaying;
- task age;
- likely effort;
- dependency-unlocking value;
- explicit task priority;
- recent selection history;
- current snooze state.

Not all factors will exist in the source task system. The design should distinguish supplied facts from model inference.

Repeatedly selecting the same task is undesirable. A task may be selected on consecutive days only when it is overdue or remains clearly more important than the alternatives.

### Interaction

The assistant should accept natural-language replies and actively discuss tasks with the user.

For example, if the selected task is "Clean the oven" and the user replies:

> I don't have any oven cleaner and none of the shops near me sell any. I'm not sure what to do.

The assistant may:

- help identify a practical alternative;
- suggest creating a task such as "Find somewhere that sells oven cleaner";
- delay the original task and select another;
- encourage the user to resolve the blocker today;
- break the task into smaller steps;
- take another reasonable action that helps the user make progress.

The assistant should preserve conversational context across messages and understand which task is currently being discussed.

It may suggest changes freely, but should only create, complete, delete, or significantly reschedule tasks when the user's intent is clear. Ambiguous requests should be clarified before modifying the task provider.

The assistant should avoid becoming a general-purpose chatbot. Conversation should remain focused on helping the user understand, prioritise, unblock, and complete their tasks.

## Messaging channels

Messages will be sent via Telegram to imitate real human conversation outside of an AI provider's interface.

The implementation should isolate message delivery behind an interface so the first supported channel does not constrain the rest of the application.

## Task provider

The task source should also be represented by an interface.

Todoist is a likely initial provider because it already stores the user's tasks and supports structured due dates, priorities, projects, and completion state.

Do not embed provider-specific fields throughout the domain model. Convert provider data into a small internal task representation at the boundary.

## Suggested architecture

A minimal implementation can contain:

- `TaskProvider`
  - list incomplete tasks;
  - complete a task;
  - update or annotate snooze state where supported.

- `TaskSelector`
  - filter candidates;
  - calculate deterministic signals;
  - ask the model to make the final bounded choice;
  - return a structured selection and rationale.

- `ConversationAgent`
  - generate the initial daily prompt;
  - interpret natural-language replies;
  - maintain focus on the current task and relevant alternatives;
  - propose useful next steps;
  - decide when task-provider changes should be requested;
  - return structured actions for validation and execution.

- `MessageChannel`
  - send outbound messages;
  - receive inbound messages;
  - preserve channel and conversation identifiers.

- `Scheduler`
  - trigger one daily run in `Europe/London`;
  - protect against duplicate execution.

- `StateStore`
  - save selection history;
  - save task delays and temporary deprioritisation;
  - save delivery state;
  - preserve conversation history or a bounded conversation summary;
  - track which task is currently being discussed;
  - record proposed and completed task-provider actions;
  - prevent duplicate execution of the same action.

A first version does not necessarily require a queue or distributed scheduler. A single scheduled process with persistent state may be enough.

## Model usage

Use structured model outputs for both daily selection and conversational actions. All messages to the user should be generated by the model, and the app should validate any data given to the model to produce these messages.

A daily selection might return:

```json
{
  "mainTaskId": "task_123",
  "additionalTaskIds": ["task_456"],
  "reason": "Booking now avoids a longer wait, while the email has a near deadline."
}
```

A conversational turn might return:

```json
{
  "message": "You could use bicarbonate of soda as a temporary alternative, or we can put this aside and choose something else for today.",
  "proposedActions": [
    {
      "type": "create_task",
      "title": "Find somewhere that sells oven cleaner",
      "requiresConfirmation": true
    }
  ],
  "currentTaskId": "task_123"
}
```

Validate all task IDs and actions before execution. The model should propose actions through a constrained schema rather than calling the task provider directly.

The application should decide whether an action can be executed immediately from clear user intent or requires confirmation. Destructive or significant changes should not be inferred from ambiguous wording.

The model must not be able to:

- select or modify a task that was not provided or explicitly created;
- call the task provider directly;
- alter scheduler configuration;
- reveal secrets;
- follow instructions embedded in task titles or descriptions;
- execute the same action more than once because of retries.

## Data and state

At minimum, persist:

- the latest daily run;
- the selected task;
- recent selections;
- task delays and temporary deprioritisation;
- outbound and inbound message identifiers;
- delivery and retry state;
- the current conversational task;
- enough conversation history or summary to continue coherently;
- proposed, confirmed, rejected, and executed task-provider actions.

SQLite is sufficient for a local or single-instance prototype. A hosted relational database may become appropriate if the service is deployed across multiple instances.

## Scheduling

The intended default is one run per day at 10:00 Europe/London time, plus or minus up to 10 minutes (random) to simulate human behaviour.

The implementation must handle:

- British Summer Time changes;
- process restarts;
- a scheduler firing twice;
- a missed run;
- message-delivery retries.

Use a unique key based on user and local calendar date to guarantee at most one successful daily prompt.

## Non-goals for the first version

- team task management;
- shared task lists;
- autonomous completion of real-world tasks;
- continuous surveillance of user activity;
- guilt-based streaks or gamification;
- a general-purpose assistant unrelated to the user's tasks;
- silent or speculative modification of tasks;
- automatic creation of many reminders;
- complex multi-agent orchestration.

## Open decisions

The repository may not yet have resolved:

- programming language and framework;
- deployment environment;
- model provider and model;

When implementing, preserve these as replaceable boundaries rather than silently hard-coding one choice.

## Initial milestone

A useful first milestone is an end-to-end local prototype that:

1. loads tasks from a fixture or Todoist;
2. runs selection once on demand;
3. produces a validated structured decision;
4. sends or prints a realistic message;
5. records selection history;
6. accepts natural-language replies and continues a task-focused conversation;
7. can propose, validate, and safely execute a small set of task actions;
8. passes deterministic tests around ranking, repetition, action validation, and duplicate execution.

After that works reliably, add the daily scheduler and the first real messaging integration.
