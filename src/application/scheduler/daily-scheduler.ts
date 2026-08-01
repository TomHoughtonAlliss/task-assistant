import { randomUUID } from "node:crypto";
import { DailyRunGuard } from "../daily-run-guard/daily-run-guard.js";
import type {
  DailySchedulerConfig,
  DailySchedulerHandler,
  DailySchedulerHandlerInput,
  DailySchedulerTriggerReason,
  Scheduler,
} from "./types.js";

const localDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/u;
const localTimePattern = /^(\d{2}):(\d{2})$/u;
const millisecondsPerMinute = 60_000;
const minutesPerDay = 1_440;

/**
 * In-process scheduler that fires one guarded daily run around the configured local time.
 */
export class DailyScheduler implements Scheduler {
  private readonly runGuard: DailyRunGuard;
  private readonly handler: DailySchedulerHandler;
  private readonly config: DailySchedulerConfig;
  private readonly now: () => Date;
  private readonly setTimeoutImplementation: typeof setTimeout;
  private readonly clearTimeoutImplementation: typeof clearTimeout;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private started = false;

  /**
   * Creates a daily scheduler with guarded execution, deterministic jitter, and startup recovery.
   */
  public constructor(
    runGuard: DailyRunGuard,
    handler: DailySchedulerHandler,
    config: DailySchedulerConfig,
  ) {
    this.runGuard = runGuard;
    this.handler = handler;
    this.config = config;
    this.now = config.now ?? (() => new Date());
    this.setTimeoutImplementation =
      config.setTimeoutImplementation ?? setTimeout;
    this.clearTimeoutImplementation =
      config.clearTimeoutImplementation ?? clearTimeout;
  }

  /**
   * Starts the scheduler and performs recovery for immediately missed eligible runs.
   */
  public async start(): Promise<void> {
    if (this.started) {
      return;
    }

    this.started = true;
    await this.recoverMissedRuns();
    this.scheduleNext();
  }

  /**
   * Stops future scheduling and clears any pending timer.
   */
  public stop(): void {
    this.started = false;

    if (this.timer) {
      this.clearTimeoutImplementation(this.timer);
      this.timer = null;
    }
  }

  /**
   * Schedules the next future daily run based on the configured timezone, local time, and jitter.
   */
  private scheduleNext(): void {
    if (!this.started) {
      return;
    }

    const now = this.now();
    const currentLocalDate = getLocalDateString(now, this.config.timezone);
    const todayScheduledAt = getScheduledInstantForLocalDate(
      currentLocalDate,
      this.config,
    );

    const nextLocalDate =
      todayScheduledAt.getTime() > now.getTime()
        ? currentLocalDate
        : addDaysToLocalDate(currentLocalDate, 1);
    const nextScheduledAt = getScheduledInstantForLocalDate(
      nextLocalDate,
      this.config,
    );
    const delayMilliseconds = Math.max(
      0,
      nextScheduledAt.getTime() - now.getTime(),
    );

    this.timer = this.setTimeoutImplementation(() => {
      void this.handleScheduledFire(nextLocalDate);
    }, delayMilliseconds);
  }

  /**
   * Handles one scheduled timer fire and then schedules the following day.
   */
  private async handleScheduledFire(localDate: string): Promise<void> {
    try {
      await this.triggerLocalDate(localDate, "scheduled");
    } finally {
      this.scheduleNext();
    }
  }

  /**
   * Recovers immediately eligible missed runs for yesterday and today after process startup.
   */
  private async recoverMissedRuns(): Promise<void> {
    const now = this.now();
    const today = getLocalDateString(now, this.config.timezone);
    const yesterday = addDaysToLocalDate(today, -1);
    const recoverableDates = [yesterday, today].filter((localDate) => {
      const scheduledAt = getScheduledInstantForLocalDate(localDate, this.config);
      return scheduledAt.getTime() <= now.getTime();
    });

    for (const localDate of recoverableDates) {
      await this.triggerLocalDate(localDate, "missed_recovery");
    }
  }

  /**
   * Acquires one guarded local-date run and invokes the daily pipeline when allowed.
   */
  private async triggerLocalDate(
    localDate: string,
    reason: DailySchedulerTriggerReason,
  ): Promise<void> {
    const now = this.now();
    const nowIso = now.toISOString();
    const acquisition = this.runGuard.acquire({
      userKey: this.config.userKey,
      localDate,
      now: nowIso,
      runId: randomUUID(),
    });

    if (acquisition.decision !== "acquired") {
      return;
    }

    const handlerInput: DailySchedulerHandlerInput = {
      run: acquisition.run,
      localDate,
      reason,
      scheduledFor: getScheduledInstantForLocalDate(
        localDate,
        this.config,
      ).toISOString(),
      triggeredAt: nowIso,
    };

    try {
      await this.handler(handlerInput);
    } catch (error: unknown) {
      this.runGuard.updateStatus({
        run: acquisition.run,
        status: "delivery_failed",
        now: this.now().toISOString(),
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}

/**
 * Returns the scheduled absolute instant for one local calendar date after deterministic jitter.
 */
function getScheduledInstantForLocalDate(
  localDate: string,
  config: Pick<
    DailySchedulerConfig,
    "jitterMinutes" | "localTime" | "timezone" | "userKey"
  >,
): Date {
  const [hour, minute] = parseLocalTime(config.localTime);
  const jitterMinutes = getDeterministicDailyJitterMinutes(
    config.userKey,
    localDate,
    config.jitterMinutes,
  );
  const totalMinutes = hour * 60 + minute + jitterMinutes;
  const dayOffset = Math.floor(totalMinutes / minutesPerDay);
  const normalizedMinutes =
    ((totalMinutes % minutesPerDay) + minutesPerDay) % minutesPerDay;
  const scheduledDate = addDaysToLocalDate(localDate, dayOffset);

  return convertLocalDateTimeToUtc(
    scheduledDate,
    Math.floor(normalizedMinutes / 60),
    normalizedMinutes % 60,
    config.timezone,
  );
}

/**
 * Converts one local-date/local-time pair in an IANA timezone into an absolute UTC `Date`.
 */
function convertLocalDateTimeToUtc(
  localDate: string,
  hour: number,
  minute: number,
  timezone: string,
): Date {
  const [year, month, day] = parseLocalDate(localDate);
  const naiveUtcMilliseconds = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const firstGuess = new Date(naiveUtcMilliseconds);
  const firstOffsetMinutes = getTimeZoneOffsetMinutes(firstGuess, timezone);
  const correctedUtcMilliseconds =
    naiveUtcMilliseconds - firstOffsetMinutes * millisecondsPerMinute;
  const correctedDate = new Date(correctedUtcMilliseconds);
  const correctedOffsetMinutes = getTimeZoneOffsetMinutes(correctedDate, timezone);

  return new Date(
    naiveUtcMilliseconds - correctedOffsetMinutes * millisecondsPerMinute,
  );
}

/**
 * Returns the local date string for one absolute instant in the supplied timezone.
 */
function getLocalDateString(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = readPart(parts, "year");
  const month = readPart(parts, "month");
  const day = readPart(parts, "day");
  return `${year}-${month}-${day}`;
}

/**
 * Returns the timezone offset in minutes at one absolute instant.
 */
function getTimeZoneOffsetMinutes(date: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    timeZoneName: "shortOffset",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const offsetValue = readPart(parts, "timeZoneName");

  if (offsetValue === "GMT" || offsetValue === "UTC") {
    return 0;
  }

  const match =
    /^GMT(?<sign>[+-])(?<hours>\d{1,2})(?::(?<minutes>\d{2}))?$/u.exec(
      offsetValue,
    );
  if (!match?.groups) {
    throw new Error(`Unsupported timezone offset format: ${offsetValue}`);
  }

  const sign = match.groups.sign === "-" ? -1 : 1;
  const hours = Number(match.groups.hours);
  const minutes = Number(match.groups.minutes ?? "0");
  return sign * (hours * 60 + minutes);
}

/**
 * Returns a stable per-day jitter offset within the configured positive and negative range.
 */
function getDeterministicDailyJitterMinutes(
  userKey: string,
  localDate: string,
  maxJitterMinutes: number,
): number {
  if (maxJitterMinutes === 0) {
    return 0;
  }

  const seed = `${userKey}:${localDate}`;
  let hash = 0;
  for (const character of seed) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }

  const range = maxJitterMinutes * 2 + 1;
  return (hash % range) - maxJitterMinutes;
}

/**
 * Adds whole days to one `YYYY-MM-DD` local-date string.
 */
function addDaysToLocalDate(localDate: string, days: number): string {
  const [year, month, day] = parseLocalDate(localDate);
  const utcDate = new Date(Date.UTC(year, month - 1, day + days));
  return utcDate.toISOString().slice(0, 10);
}

/**
 * Parses one `YYYY-MM-DD` local-date string into numeric parts.
 */
function parseLocalDate(localDate: string): [year: number, month: number, day: number] {
  const match = localDatePattern.exec(localDate);
  if (!match) {
    throw new Error(`Invalid local date: ${localDate}`);
  }

  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/**
 * Parses one `HH:MM` local-time string into numeric parts.
 */
function parseLocalTime(localTime: string): [hour: number, minute: number] {
  const match = localTimePattern.exec(localTime);
  if (!match) {
    throw new Error(`Invalid local time: ${localTime}`);
  }

  return [Number(match[1]), Number(match[2])];
}

/**
 * Reads one named date-time-format part from an Intl parts array.
 */
function readPart(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
): string {
  const part = parts.find((candidate) => candidate.type === type);
  if (!part) {
    throw new Error(`Missing Intl date-time part: ${type}`);
  }

  return part.value;
}
