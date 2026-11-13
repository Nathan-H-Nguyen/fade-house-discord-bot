import Database from "better-sqlite3";

/**
 * Schema migrations, applied in order and never edited once released.
 * The database's `user_version` records how many have run.
 */
const migrations: readonly string[] = [
  `CREATE TABLE chores (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    scope TEXT NOT NULL CHECK (scope IN ('global', 'floor-1', 'floor-3')),
    retired INTEGER NOT NULL DEFAULT 0 CHECK (retired IN (0, 1)),
    added_at TEXT NOT NULL
  ) STRICT`,
  // A backstop for the House's own check, which also folds non-ASCII case that NOCASE does not.
  // Fails on a database that already holds active Chores whose names differ only in case.
  `CREATE UNIQUE INDEX chores_active_name ON chores (name COLLATE NOCASE) WHERE retired = 0`,
  // The scheduler's ledger: one row per job and period, written once the run completes.
  `CREATE TABLE job_runs (
    job TEXT NOT NULL,
    period TEXT NOT NULL,
    completed_at TEXT NOT NULL,
    PRIMARY KEY (job, period)
  ) STRICT`,
  // When the scheduler first saw each job, as a house time YYYY-MM-DD HH:MM.
  `CREATE TABLE job_schedules (
    job TEXT PRIMARY KEY,
    since TEXT NOT NULL
  ) STRICT`,
  // One Chore given to one Housemate for one month (YYYY-MM). The Chore's name and Scope are
  // copied as assigned, so later edits to the Chore never change existing Assignments.
  `CREATE TABLE assignments (
    id INTEGER PRIMARY KEY,
    month TEXT NOT NULL,
    chore_id INTEGER NOT NULL REFERENCES chores (id),
    chore_name TEXT NOT NULL,
    chore_scope TEXT NOT NULL CHECK (chore_scope IN ('global', 'floor-1', 'floor-3')),
    housemate_id TEXT NOT NULL,
    UNIQUE (month, chore_id)
  ) STRICT`,
  // When the Housemate completed the Assignment, or null while it is open.
  `ALTER TABLE assignments ADD COLUMN completed_at TEXT`,
];

/** Opens the database at `path` (or `:memory:`) and brings its schema up to date. */
export function openDatabase(path: string): Database.Database {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  const applied = db.pragma("user_version", { simple: true }) as number;
  if (applied > migrations.length) {
    throw new Error(
      `Database schema version ${String(applied)} is newer than this bot knows (${String(migrations.length)}).`,
    );
  }

  db.transaction(() => {
    migrations.slice(applied).forEach((sql) => db.exec(sql));
    db.pragma(`user_version = ${String(migrations.length)}`);
  })();

  return db;
}
