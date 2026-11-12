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
