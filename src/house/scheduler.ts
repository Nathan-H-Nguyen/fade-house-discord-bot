import type Database from "better-sqlite3";
import { formatDate, previousDay, type LocalDateTime } from "./calendar.ts";
import type { Outbound } from "./index.ts";

/** A job that runs once a day from a fixed house time, for the date it falls on. */
export interface DailyJob {
  name: string;
  hour: number;
  minute: number;
  /** Runs the job for `date` (YYYY-MM-DD), returning the messages it sends. */
  run(date: string): Promise<Outbound[]>;
}

/** The date of the job's most recent start time at or before `now`. */
function currentPeriod(job: DailyJob, now: LocalDateTime): string {
  const started =
    now.hour > job.hour || (now.hour === job.hour && now.minute >= job.minute);
  return formatDate(started ? now : previousDay(now));
}

/**
 * Runs every job whose current period is missing from the ledger, recording each once it completes,
 * so a job runs at most once per period across restarts.
 * After downtime a missed job runs once, for the current period only: earlier periods are not backfilled.
 */
export async function runDueJobs(
  db: Database.Database,
  jobs: readonly DailyJob[],
  now: LocalDateTime,
  completedAt: Date,
): Promise<Outbound[]> {
  const hasRun = db.prepare<[string, string], 1>(
    "SELECT 1 FROM job_runs WHERE job = ? AND period = ?",
  );
  const record = db.prepare<[string, string, string]>(
    "INSERT INTO job_runs (job, period, completed_at) VALUES (?, ?, ?)",
  );

  const outbound: Outbound[] = [];
  for (const job of jobs) {
    const period = currentPeriod(job, now);
    if (hasRun.get(job.name, period)) continue;
    outbound.push(...(await job.run(period)));
    record.run(job.name, period, completedAt.toISOString());
  }
  return outbound;
}
