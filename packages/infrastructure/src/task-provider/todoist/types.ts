import { z } from "zod";

const todoistDateTimeSchema = z.string().min(1);

/**
 * Todoist due information for an active task response.
 */
export const todoistDueSchema = z.object({
  date: z.string().min(1),
  datetime: todoistDateTimeSchema.nullish(),
  timezone: z.string().min(1).nullish(),
  is_recurring: z.boolean().nullish(),
  string: z.string().min(1).nullish(),
  lang: z.string().min(1).nullish(),
});

/**
 * Todoist deadline information for an active task response.
 */
export const todoistDeadlineSchema = z.object({
  date: z.string().min(1),
  lang: z.string().min(1).nullish(),
});

/**
 * Todoist active task response shape used by the adapter.
 */
export const todoistTaskSchema = z.object({
  id: z.string().min(1),
  project_id: z.string().min(1),
  content: z.string().min(1),
  description: z.string(),
  added_at: z.string().min(1).nullish(),
  priority: z.number().int().min(1).max(4),
  due: todoistDueSchema.nullish(),
  deadline: todoistDeadlineSchema.nullish(),
});

/**
 * Todoist active task response shape used by the adapter.
 */
export type TodoistTask = z.infer<typeof todoistTaskSchema>;

/**
 * Todoist project response shape used by the adapter.
 */
export const todoistProjectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
});

/**
 * Todoist project response shape used by the adapter.
 */
export type TodoistProject = z.infer<typeof todoistProjectSchema>;

/**
 * Cursor-paginated Todoist project list response.
 */
export const todoistProjectPageSchema = z.object({
  results: z.array(todoistProjectSchema),
  next_cursor: z.string().min(1).nullish(),
});

/**
 * Cursor-paginated Todoist project list response.
 */
export type TodoistProjectPage = z.infer<typeof todoistProjectPageSchema>;

/**
 * Cursor-paginated Todoist task list response.
 */
export const todoistTaskPageSchema = z.object({
  results: z.array(todoistTaskSchema),
  next_cursor: z.string().min(1).nullish(),
});

/**
 * Cursor-paginated Todoist task list response.
 */
export type TodoistTaskPage = z.infer<typeof todoistTaskPageSchema>;
