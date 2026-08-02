import { z } from "zod";

/**
 * Runtime schema for the bounded result of a daily task selection.
 */
export const taskSelectionSchema = z.object({
  mainTaskId: z.string().min(1),
  additionalTaskIds: z.array(z.string().min(1)),
  reason: z.string().min(1),
});

/**
 * Bounded result of a daily task selection.
 */
export type TaskSelection = z.infer<typeof taskSelectionSchema>;
