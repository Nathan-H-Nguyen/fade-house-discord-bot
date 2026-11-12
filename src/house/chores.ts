import type Database from "better-sqlite3";

export const scopes = ["global", "floor-1", "floor-3"] as const;

/** Who is eligible for a Chore: every Housemate, or only those on one Floor. */
export type Scope = (typeof scopes)[number];

export const scopeLabels: Record<Scope, string> = {
  global: "Global",
  "floor-1": "Floor 1",
  "floor-3": "Floor 3",
};

/** Matches the `max_length` of the slash command's name option. */
export const maxChoreNameLength = 100;

export interface Chore {
  name: string;
  scope: Scope;
}

export function addChore(
  db: Database.Database,
  chore: Chore,
  addedAt: Date,
): void {
  db.prepare("INSERT INTO chores (name, scope, added_at) VALUES (?, ?, ?)").run(
    chore.name,
    chore.scope,
    addedAt.toISOString(),
  );
}

export function activeChores(db: Database.Database): Chore[] {
  return db
    .prepare<[], Chore>(
      "SELECT name, scope FROM chores WHERE retired = 0 ORDER BY name COLLATE NOCASE, id",
    )
    .all();
}
