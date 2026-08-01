import { z } from "zod";
import { taskSchema, type Task, type TaskId, type TaskPriority } from "../../domain/index.js";
import type { SelectionHistoryEntry } from "../state-store/index.js";

const isoDateSchema = z.iso.date();
const isoDateTimeSchema = z.iso.datetime({ offset: true });
const floatingDateTimeSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?$/);

/**
 * Input required to compute deterministic ranking signals for candidate tasks.
 */
export interface ComputeRankingSignalsInput {
  /**
   * Pre-filtered candidate tasks that remain eligible for selection.
   */
  tasks: Task[];
  /**
   * Recent selection history grouped by task identifier.
   */
  selectionHistoryByTaskId: ReadonlyMap<TaskId, SelectionHistoryEntry[]>;
  /**
   * Current absolute timestamp used for age and offset-aware due-date comparisons.
   */
  now: string;
  /**
   * Current local calendar date in the user's timezone, used for date-only due dates.
   */
  localDate: string;
  /**
   * Current local date-time in the user's timezone, used for floating due datetimes.
   */
  localDateTime: string;
  /**
   * Maximum number of future days still counted as "due soon".
   */
  dueSoonThresholdDays: number;
}

/**
 * Classification of how urgent a due date is relative to the current moment.
 */
export const dueStatusSchema = z.enum([
  "none",
  "overdue",
  "due_today",
  "due_soon",
  "future",
  "unknown",
]);

/**
 * Classification of how urgent a due date is relative to the current moment.
 */
export type DueStatus = z.infer<typeof dueStatusSchema>;

/**
 * Serializable due-date signal used by ranking and model selection.
 */
export const dueSignalSchema = z.object({
  status: dueStatusSchema,
  dueDate: isoDateSchema.optional(),
  dueDateTime: z.union([isoDateTimeSchema, floatingDateTimeSchema]).optional(),
  timezone: z.string().min(1).optional(),
  daysUntilDue: z.number().int().optional(),
  daysOverdue: z.number().int().optional(),
  score: z.number().int(),
});

/**
 * Serializable due-date signal used by ranking and model selection.
 */
export type DueSignal = z.infer<typeof dueSignalSchema>;

/**
 * Serializable task-age signal used by ranking and model selection.
 */
export const ageSignalSchema = z.object({
  hasCreatedAt: z.boolean(),
  ageDays: z.number().int().optional(),
  score: z.number().int(),
});

/**
 * Serializable task-age signal used by ranking and model selection.
 */
export type AgeSignal = z.infer<typeof ageSignalSchema>;

/**
 * Serializable priority signal used by ranking and model selection.
 */
export const prioritySignalSchema = z.object({
  value: z.enum(["low", "medium", "high", "urgent"]),
  score: z.number().int(),
});

/**
 * Serializable priority signal used by ranking and model selection.
 */
export type PrioritySignal = z.infer<typeof prioritySignalSchema>;

/**
 * Serializable recent-selection signal used to reduce repeated recommendations.
 */
export const recentSelectionSignalSchema = z.object({
  selectionCount: z.number().int().min(0),
  selectedRecently: z.boolean(),
  lastSelectedAt: isoDateTimeSchema.optional(),
  daysSinceLastSelection: z.number().int().optional(),
  penaltyScore: z.number().int(),
});

/**
 * Serializable recent-selection signal used to reduce repeated recommendations.
 */
export type RecentSelectionSignal = z.infer<typeof recentSelectionSignalSchema>;

/**
 * Explicit placeholder for an effort hint when no source fact exists yet.
 */
export const effortHintSignalSchema = z.object({
  status: z.enum(["unknown"]),
});

/**
 * Explicit placeholder for an effort hint when no source fact exists yet.
 */
export type EffortHintSignal = z.infer<typeof effortHintSignalSchema>;

/**
 * Explicit placeholder for a dependency-unlocking hint when no source fact exists yet.
 */
export const dependencyHintSignalSchema = z.object({
  status: z.enum(["unknown"]),
});

/**
 * Explicit placeholder for a dependency-unlocking hint when no source fact exists yet.
 */
export type DependencyHintSignal = z.infer<typeof dependencyHintSignalSchema>;

/**
 * Deterministic ranking signals attached to one candidate task.
 */
export const taskRankingSignalsSchema = z.object({
  taskId: z.string().min(1),
  due: dueSignalSchema,
  age: ageSignalSchema,
  priority: prioritySignalSchema,
  recentSelection: recentSelectionSignalSchema,
  effortHint: effortHintSignalSchema,
  dependencyHint: dependencyHintSignalSchema,
  totalScore: z.number().int(),
});

/**
 * Deterministic ranking signals attached to one candidate task.
 */
export type TaskRankingSignals = z.infer<typeof taskRankingSignalsSchema>;

/**
 * Serializable ranking payload entry used as input to later model selection.
 */
export const rankingPayloadEntrySchema = z.object({
  task: taskSchema,
  signals: taskRankingSignalsSchema,
});

/**
 * Serializable ranking payload entry used as input to later model selection.
 */
export type RankingPayloadEntry = z.infer<typeof rankingPayloadEntrySchema>;

/**
 * Serializable ranking payload produced for a batch of candidate tasks.
 */
export const rankingPayloadSchema = z.object({
  generatedAt: isoDateTimeSchema,
  localDate: isoDateSchema,
  entries: z.array(rankingPayloadEntrySchema),
});

/**
 * Serializable ranking payload produced for a batch of candidate tasks.
 */
export type RankingPayload = z.infer<typeof rankingPayloadSchema>;

/**
 * Computes deterministic ranking signals for candidate tasks without any live provider dependencies.
 */
export function computeRankingPayload(
  input: ComputeRankingSignalsInput,
): RankingPayload {
  const entries = input.tasks.map((task) => {
    const signals = computeTaskRankingSignals(
      task,
      input.selectionHistoryByTaskId.get(task.id) ?? [],
      input,
    );

    return {
      task,
      signals,
    };
  });

  return {
    generatedAt: input.now,
    localDate: input.localDate,
    entries,
  };
}

/**
 * Computes deterministic signals for one task using only explicit source facts and persisted history.
 */
export function computeTaskRankingSignals(
  task: Task,
  selectionHistory: SelectionHistoryEntry[],
  context: Omit<ComputeRankingSignalsInput, "tasks" | "selectionHistoryByTaskId">,
): TaskRankingSignals {
  const due = computeDueSignal(
    task,
    context.localDate,
    context.localDateTime,
    context.now,
    context.dueSoonThresholdDays,
  );
  const age = computeAgeSignal(task, context.now);
  const priority = computePrioritySignal(task.priority);
  const recentSelection = computeRecentSelectionSignal(
    selectionHistory,
    context.localDate,
  );
  const effortHint: EffortHintSignal = {
    status: "unknown",
  };
  const dependencyHint: DependencyHintSignal = {
    status: "unknown",
  };

  return {
    taskId: task.id,
    due,
    age,
    priority,
    recentSelection,
    effortHint,
    dependencyHint,
    totalScore:
      due.score + age.score + priority.score + recentSelection.penaltyScore,
  };
}

/**
 * Computes the deterministic due-date signal for one task.
 */
function computeDueSignal(
  task: Task,
  localDate: string,
  localDateTime: string,
  now: string,
  dueSoonThresholdDays: number,
): DueSignal {
  if (!task.dueDate) {
    return {
      status: "none",
      score: 0,
    };
  }

  if (task.dueDate.kind === "date") {
    const daysUntilDue = differenceInDays(task.dueDate.date, localDate);

    if (daysUntilDue < 0) {
      return {
        status: "overdue",
        dueDate: task.dueDate.date,
        daysOverdue: Math.abs(daysUntilDue),
        score: 6 + Math.min(Math.abs(daysUntilDue), 4),
      };
    }

    if (daysUntilDue === 0) {
      return {
        status: "due_today",
        dueDate: task.dueDate.date,
        daysUntilDue,
        score: 5,
      };
    }

    if (daysUntilDue <= dueSoonThresholdDays) {
      return {
        status: "due_soon",
        dueDate: task.dueDate.date,
        daysUntilDue,
        score: Math.max(1, dueSoonThresholdDays - daysUntilDue + 1),
      };
    }

    return {
      status: "future",
      dueDate: task.dueDate.date,
      daysUntilDue,
      score: 0,
    };
  }

  const comparison = compareTaskDateTime(task.dueDate.dateTime, task.dueDate.timezone, now, localDateTime);

  if (!comparison) {
    const signal: DueSignal = {
      status: "unknown",
      dueDateTime: task.dueDate.dateTime,
      score: 0,
    };

    if (task.dueDate.timezone) {
      signal.timezone = task.dueDate.timezone;
    }

    return signal;
  }

  if (comparison.kind === "overdue") {
    const signal: DueSignal = {
      status: "overdue",
      dueDateTime: task.dueDate.dateTime,
      daysOverdue: comparison.daysDistance,
      score: 6 + Math.min(comparison.daysDistance, 4),
    };

    if (task.dueDate.timezone) {
      signal.timezone = task.dueDate.timezone;
    }

    return signal;
  }

  if (comparison.daysDistance === 0) {
    const signal: DueSignal = {
      status: "due_today",
      dueDateTime: task.dueDate.dateTime,
      daysUntilDue: 0,
      score: 5,
    };

    if (task.dueDate.timezone) {
      signal.timezone = task.dueDate.timezone;
    }

    return signal;
  }

  if (comparison.daysDistance <= dueSoonThresholdDays) {
    const signal: DueSignal = {
      status: "due_soon",
      dueDateTime: task.dueDate.dateTime,
      daysUntilDue: comparison.daysDistance,
      score: Math.max(1, dueSoonThresholdDays - comparison.daysDistance + 1),
    };

    if (task.dueDate.timezone) {
      signal.timezone = task.dueDate.timezone;
    }

    return signal;
  }

  const signal: DueSignal = {
    status: "future",
    dueDateTime: task.dueDate.dateTime,
    daysUntilDue: comparison.daysDistance,
    score: 0,
  };

  if (task.dueDate.timezone) {
    signal.timezone = task.dueDate.timezone;
  }

  return signal;
}

/**
 * Computes the deterministic task-age signal when the provider supplied a creation timestamp.
 */
function computeAgeSignal(task: Task, now: string): AgeSignal {
  if (!task.createdAt) {
    return {
      hasCreatedAt: false,
      score: 0,
    };
  }

  const ageDays = Math.max(0, Math.floor((Date.parse(now) - Date.parse(task.createdAt)) / millisecondsPerDay));

  return {
    hasCreatedAt: true,
    ageDays,
    score: Math.min(Math.floor(ageDays / 7), 4),
  };
}

/**
 * Computes the deterministic priority signal from the normalized task priority.
 */
function computePrioritySignal(priority: TaskPriority): PrioritySignal {
  return {
    value: priority,
    score: priorityScores[priority],
  };
}

/**
 * Computes the deterministic recent-selection penalty for one task.
 */
function computeRecentSelectionSignal(
  selectionHistory: SelectionHistoryEntry[],
  localDate: string,
): RecentSelectionSignal {
  if (selectionHistory.length === 0) {
    return {
      selectionCount: 0,
      selectedRecently: false,
      penaltyScore: 0,
    };
  }

  const mostRecent = selectionHistory[0];

  if (!mostRecent) {
    return {
      selectionCount: 0,
      selectedRecently: false,
      penaltyScore: 0,
    };
  }

  const daysSinceLastSelection = Math.max(
    0,
    differenceInDays(localDate, mostRecent.localDate),
  );
  const selectedRecently = daysSinceLastSelection <= 3;
  const basePenalty = selectedRecently ? -3 : 0;
  const repeatedPenalty = -Math.min(selectionHistory.length - 1, 2);
  const result: RecentSelectionSignal = {
    selectionCount: selectionHistory.length,
    selectedRecently,
    penaltyScore: basePenalty + repeatedPenalty,
  };

  if (mostRecent.createdAt && !Number.isNaN(Date.parse(mostRecent.createdAt))) {
    result.lastSelectedAt = mostRecent.createdAt;
  }

  result.daysSinceLastSelection = daysSinceLastSelection;

  return result;
}

/**
 * Compares a task date-time against the current moment using the best available time facts.
 */
function compareTaskDateTime(
  dueDateTime: string,
  timezone: string | undefined,
  now: string,
  localDateTime: string,
): { kind: "overdue" | "future"; daysDistance: number } | null {
  const dueInstant = timezone
    ? Date.parse(dueDateTime)
    : Date.parse(`${dueDateTime}Z`);
  const nowInstant = timezone ? Date.parse(now) : Date.parse(`${localDateTime}Z`);

  if (Number.isNaN(dueInstant) || Number.isNaN(nowInstant)) {
    return null;
  }

  const difference = dueInstant - nowInstant;
  const daysDistance = Math.max(0, Math.ceil(Math.abs(difference) / millisecondsPerDay));

  if (difference < 0) {
    return {
      kind: "overdue",
      daysDistance,
    };
  }

  return {
    kind: "future",
    daysDistance,
  };
}

/**
 * Returns the calendar-day difference between two `YYYY-MM-DD` values.
 */
function differenceInDays(leftDate: string, rightDate: string): number {
  const left = Date.parse(`${leftDate}T00:00:00Z`);
  const right = Date.parse(`${rightDate}T00:00:00Z`);

  return Math.round((left - right) / millisecondsPerDay);
}

/**
 * Number of milliseconds in one 24-hour day, used for deterministic day-based comparisons.
 */
const millisecondsPerDay = 24 * 60 * 60 * 1000;

/**
 * Deterministic numeric weight assigned to each normalized task priority.
 */
const priorityScores: Record<TaskPriority, number> = {
  low: 0,
  medium: 1,
  high: 2,
  urgent: 3,
};
