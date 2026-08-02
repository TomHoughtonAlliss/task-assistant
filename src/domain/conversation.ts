import { z } from "zod";

const taskReferenceSchema = z.string().min(1);
const nonEmptyTextSchema = z.string().min(1);
const isoDateSchema = z.iso.date();
const isoDateTimeSchema = z.iso.datetime({ offset: true });
const nullableNonEmptyTextSchema = nonEmptyTextSchema.nullable();
const nullableIsoDateSchema = isoDateSchema.nullable();
const nullableTaskReferenceSchema = taskReferenceSchema.nullable();

/**
 * Runtime schema for creating a new task proposal.
 *
 * OpenAI's strict structured-output validator requires every declared object
 * property to appear in the JSON Schema `required` array. Optional action
 * fields are therefore represented as nullable required fields rather than
 * omitted properties.
 */
export const createTaskActionSchema = z.object({
  type: z.literal("create_task"),
  title: nonEmptyTextSchema,
  description: nullableNonEmptyTextSchema,
  projectName: nullableNonEmptyTextSchema,
  dueDate: nullableIsoDateSchema,
  requiresConfirmation: z.boolean(),
});

/**
 * Runtime schema for completing an existing task proposal.
 */
export const completeTaskActionSchema = z.object({
  type: z.literal("complete_task"),
  taskId: taskReferenceSchema,
  requiresConfirmation: z.boolean(),
});

/**
 * Runtime schema for snoozing an existing task proposal.
 */
export const snoozeTaskActionSchema = z.object({
  type: z.literal("snooze_task"),
  taskId: taskReferenceSchema,
  until: isoDateTimeSchema,
  reason: nullableNonEmptyTextSchema,
  requiresConfirmation: z.boolean(),
});

/**
 * Runtime schema for rescheduling a task's due date.
 */
export const rescheduleTaskActionSchema = z.object({
  type: z.literal("reschedule_task"),
  taskId: taskReferenceSchema,
  dueDate: isoDateSchema,
  requiresConfirmation: z.boolean(),
});

/**
 * Runtime schema for updating non-destructive task fields.
 */
export const updateTaskActionSchema = z.object({
  type: z.literal("update_task"),
  taskId: taskReferenceSchema,
  title: nullableNonEmptyTextSchema,
  description: nullableNonEmptyTextSchema,
  projectName: nullableNonEmptyTextSchema,
  requiresConfirmation: z.boolean(),
});

/**
 * Runtime schema for deleting an existing task proposal.
 */
export const deleteTaskActionSchema = z.object({
  type: z.literal("delete_task"),
  taskId: taskReferenceSchema,
  requiresConfirmation: z.boolean(),
});

/**
 * Runtime schema for all supported model-proposed task actions.
 */
export const proposedTaskActionSchema = z.discriminatedUnion("type", [
  createTaskActionSchema,
  completeTaskActionSchema,
  snoozeTaskActionSchema,
  rescheduleTaskActionSchema,
  updateTaskActionSchema,
  deleteTaskActionSchema,
]);

/**
 * Supported model-proposed task actions.
 */
export type ProposedTaskAction = z.infer<typeof proposedTaskActionSchema>;

/**
 * Runtime schema for a task-focused conversational reply.
 */
export const conversationReplySchema = z.object({
  message: nonEmptyTextSchema,
  proposedActions: z.array(proposedTaskActionSchema),
  currentTaskId: nullableTaskReferenceSchema,
});

/**
 * Task-focused conversational reply that may include proposed actions.
 */
export type ConversationReply = z.infer<typeof conversationReplySchema>;
