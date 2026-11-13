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

/** A Chore as stored, with the id that stays the same through edits. */
export interface StoredChore extends Chore {
  id: number;
}

export function activeChores(db: Database.Database): StoredChore[] {
  return db
    .prepare<[], StoredChore>(
      "SELECT id, name, scope FROM chores WHERE retired = 0 ORDER BY name COLLATE NOCASE, id",
    )
    .all();
}

/** Chore names are compared ignoring case, so "Kitchen" and "kitchen" are the same Chore. */
export function foldChoreName(name: string): string {
  return name.toLowerCase();
}

export function sameChoreName(a: string, b: string): boolean {
  return foldChoreName(a) === foldChoreName(b);
}

export function findActiveChore(
  db: Database.Database,
  name: string,
): StoredChore | undefined {
  return activeChores(db).find((c) => sameChoreName(c.name, name));
}

/** Changes a Chore's name or Scope in place, from now on. */
export function updateChore(db: Database.Database, chore: StoredChore): void {
  db.prepare("UPDATE chores SET name = ?, scope = ? WHERE id = ?").run(
    chore.name,
    chore.scope,
    chore.id,
  );
}

/** Takes a Chore out of the pool, keeping its row so its history survives. */
export function retireChore(db: Database.Database, id: number): void {
  db.prepare("UPDATE chores SET retired = 1 WHERE id = ?").run(id);
}
