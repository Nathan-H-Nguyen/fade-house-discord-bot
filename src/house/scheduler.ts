import type Database from "better-sqlite3";
import {
  formatDate,
  formatDateTime,
  formatMonth,
  previousDay,
  previousMonth,
  type LocalDateTime,
  type Month,
} from "./calendar.ts";
import type { Outbound, Roster } from "./index.ts";

/** One occurrence of a job: named by `key`, such as 2026-11-12 or 2026-12, and starting at `start`. */
export interface Period {
  key: string;
  start: LocalDateTime;
}

/** A job that runs once per period, from the house time each period starts. */
export interface Job {
  name: string;
  /** The period whose start is the most recent at or before `now`. */
  currentPeriod(now: LocalDateTime): Period;
  /** Runs the job for `period`, with the server's members as they are now, returning the messages it sends. */
  run(period: Period, roster: Roster): Promise<Outbound[]>;
}

function startedBy(now: LocalDateTime, hour: number, minute: number): boolean {
  return now.hour > hour || (now.hour === hour && now.minute >= minute);
}

/** Periods of one day, each starting at `hour`:`minute` and named by its date. */
export function daily(hour: number, minute: number): Job["currentPeriod"] {
  return (now) => {
    const date = startedBy(now, hour, minute) ? now : previousDay(now);
    return {
      key: formatDate(date),
      start: {
        year: date.year,
        month: date.month,
        day: date.day,
        hour,
        minute,
      },
    };
  };
}

/**
 * Periods of one month, each starting at `hour`:`minute` on the day `dayOf` picks, the 1st unless given,
 * and named by its month.
 */
export function monthly(
  hour: number,
  minute: number,
  dayOf: (month: Month) => number = () => 1,
): Job["currentPeriod"] {
  const start = (month: Month): LocalDateTime => ({
    year: month.year,
    month: month.month,
    day: dayOf(month),
    hour,
    minute,
  });
  return (now) => {
    const day = dayOf(now);
    const started =
      now.day > day || (now.day === day && startedBy(now, hour, minute));
    const month = started ? now : previousMonth(now);
    return { key: formatMonth(month), start: start(month) };
  };
}

/**
 * Runs every job whose current period is missing from the ledger, recording each once it completes,
 * so a job runs at most once per period across restarts.
 * After downtime a missed job runs once, for the current period only: earlier periods are not backfilled.
 * A job never runs for a period that started before the scheduler first saw it,
 * so a new database, or a newly added job, waits for the next period rather than joining one under way.
 */
export async function runDueJobs(
  db: Database.Database,
  jobs: readonly Job[],
  roster: Roster,
  now: LocalDateTime,
  completedAt: Date,
): Promise<Outbound[]> {
  const see = db.prepare<[string, string]>(
    "INSERT OR IGNORE INTO job_schedules (job, since) VALUES (?, ?)",
  );
  const since = db
    .prepare<[string], string>("SELECT since FROM job_schedules WHERE job = ?")
    .pluck();
  const hasRun = db.prepare<[string, string], 1>(
    "SELECT 1 FROM job_runs WHERE job = ? AND period = ?",
  );
  const record = db.prepare<[string, string, string]>(
    "INSERT INTO job_runs (job, period, completed_at) VALUES (?, ?, ?)",
  );

  const outbound: Outbound[] = [];
  for (const job of jobs) {
    see.run(job.name, formatDateTime(now));
    const period = job.currentPeriod(now);
    // Both are YYYY-MM-DD HH:MM, so they compare as text.
    if (formatDateTime(period.start) < (since.get(job.name) ?? "")) continue;
    if (hasRun.get(job.name, period.key)) continue;
    outbound.push(...(await job.run(period, roster)));
    record.run(job.name, period.key, completedAt.toISOString());
  }
  return outbound;
}
