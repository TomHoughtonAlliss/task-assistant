import { z } from "zod";

/**
 * Opaque identifier for a task inside the application domain.
 */
export type TaskId = string;

/**
 * Supported priority values for tasks after provider data is normalised.
 */
export const taskPrioritySchema = z.enum(["low", "medium", "high", "urgent"]);

/**
 * Supported priority values for tasks after provider data is normalised.
 */
export type TaskPriority = z.infer<typeof taskPrioritySchema>;

const isoDateSchema = z.iso.date();
const isoDateTimeSchema = z.iso.datetime({ offset: true });
const floatingDateTimePattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?$/;

/**
 * Date-time strings accepted by the domain, including fixed-offset timestamps and floating local timestamps.
 */
export const taskDateTimeValueSchema = z.union([
  z.iso.datetime({ offset: true }),
  z.string().regex(
    floatingDateTimePattern,
    "Expected an ISO date-time with offset or a floating local timestamp",
  ),
]);

/**
 * Date-only due information for tasks that are due on a local calendar date.
 */
export const taskDueDateOnlySchema = z.object({
  kind: z.literal("date"),
  date: isoDateSchema,
});

/**
 * Date-time due information for tasks that have an exact timestamp.
 */
export const taskDueDateTimeSchema = z.object({
  kind: z.literal("date-time"),
  dateTime: taskDateTimeValueSchema,
  timezone: z.string().min(1).optional(),
});

/**
 * Structured due-date facts that can be used without leaking provider-specific fields.
 */
export const taskDueDateSchema = z.discriminatedUnion("kind", [
  taskDueDateOnlySchema,
  taskDueDateTimeSchema,
]);

/**
 * Structured due-date facts that can be used without leaking provider-specific fields.
 */
export type TaskDueDate = z.infer<typeof taskDueDateSchema>;

/**
 * Source task facts that are safe to use across application layers.
 */
export const taskSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1).optional(),
  projectName: z.string().min(1).optional(),
  dueDate: taskDueDateSchema.optional(),
  createdAt: isoDateTimeSchema.optional(),
  priority: taskPrioritySchema,
});

/**
 * Source task facts that are safe to use across application layers.
 */
export type Task = z.infer<typeof taskSchema>;
