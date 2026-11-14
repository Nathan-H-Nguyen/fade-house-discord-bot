import type Database from "better-sqlite3";
import { nameMonth, parseMonth } from "./calendar.ts";
import {
  sameChoreName,
  scopeLabels,
  type Chore,
  type Scope,
  type StoredChore,
} from "./chores.ts";
import type { Housemate } from "./housemates.ts";
import { escapeMarkdown } from "./markdown.ts";

/** One Chore given to one Housemate for one month. */
export interface Assignment {
  chore: StoredChore;
  memberId: string;
}

/** Returns numbers in [0, 1), as `Math.random` does. */
export type Random = () => number;

function isEligible(chore: Chore, housemate: Housemate): boolean {
  return (
    chore.scope === "global" ||
    chore.scope === `floor-${String(housemate.floor)}`
  );
}

function pick<T>(items: readonly T[], random: Random): T {
  const item = items[Math.floor(random() * items.length)];
  if (item === undefined) throw new Error("Cannot pick from no items");
  return item;
}

function shuffled<T>(items: readonly T[], random: Random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j] as T, result[i] as T];
  }
  return result;
}

/**
 * One randomised pass that gives each Chore to one of its eligible Housemates.
 * Every Chore must have at least one.
 */
function handOut(
  chores: readonly StoredChore[],
  housemates: readonly Housemate[],
  previous: ReadonlyMap<number, string>,
  alreadyGiven: ReadonlyMap<string, number>,
  random: Random,
): Assignment[] {
  const counts = new Map(alreadyGiven);
  const count = (h: Housemate) => counts.get(h.member.id) ?? 0;

  // Hand out the Chores with the fewest eligible Housemates first, so the wider Scopes can even out the totals.
  // The sort is stable, so the shuffle still decides the order within each size.
  const ordered = shuffled(chores, random)
    .map((chore) => ({
      chore,
      eligible: housemates.filter((h) => isEligible(chore, h)),
    }))
    .sort((a, b) => a.eligible.length - b.eligible.length);

  return ordered.map(({ chore, eligible }) => {
    // Last month's assignee takes the Chore again only if no one else can.
    const others = eligible.filter(
      (h) => h.member.id !== previous.get(chore.id),
    );
    const pool = others.length > 0 ? others : eligible;
    const fewest = Math.min(...pool.map(count));
    const chosen = pick(
      pool.filter((h) => count(h) === fewest),
      random,
    );
    counts.set(chosen.member.id, fewest + 1);
    return { chore, memberId: chosen.member.id };
  });
}

/** How uneven the Assignment counts are, counting `alreadyGiven` ones too: the sum of each Housemate's count squared. */
function unevenness(
  assignments: readonly Assignment[],
  alreadyGiven: ReadonlyMap<string, number>,
): number {
  const counts = new Map(alreadyGiven);
  for (const { memberId } of assignments) {
    counts.set(memberId, (counts.get(memberId) ?? 0) + 1);
  }
  return [...counts.values()].reduce((sum, n) => sum + n * n, 0);
}

/** How many randomised passes the plan picks the most even of. */
const passes = 100;

/**
 * Gives every Chore to one eligible Housemate, balancing the number of Assignments each gets
 * across all Scopes, and avoiding each Chore's previous assignee whenever someone else is eligible.
 * A single greedy pass can paint itself into a corner, so the plan keeps the most even of several.
 * Chores with no eligible Housemate are skipped.
 */
export function planAssignments({
  chores,
  housemates,
  previous,
  alreadyGiven = new Map(),
  random,
}: {
  chores: readonly StoredChore[];
  housemates: readonly Housemate[];
  /** Last month's assignee of each Chore, by Chore id. */
  previous: ReadonlyMap<number, string>;
  /** How many new Assignments each Housemate already has this month, by member ID, which count toward the balance. */
  alreadyGiven?: ReadonlyMap<string, number>;
  random: Random;
}): { assignments: Assignment[]; skipped: StoredChore[] } {
  const skipped = chores.filter(
    (c) => !housemates.some((h) => isEligible(c, h)),
  );
  const assignable = chores.filter((c) => !skipped.includes(c));

  let best: Assignment[] = [];
  let bestUnevenness = Infinity;
  for (let i = 0; i < passes; i++) {
    const assignments = handOut(
      assignable,
      housemates,
      previous,
      alreadyGiven,
      random,
    );
    const score = unevenness(assignments, alreadyGiven);
    if (score < bestUnevenness) {
      best = assignments;
      bestUnevenness = score;
    }
  }
  return { assignments: best, skipped };
}

/** Stores the Assignments for `month` (YYYY-MM), with each Chore's name and Scope as they are now. */
export function saveAssignments(
  db: Database.Database,
  month: string,
  assignments: readonly Assignment[],
): void {
  const insert = db.prepare<[string, number, string, string, string]>(
    "INSERT INTO assignments (month, chore_id, chore_name, chore_scope, housemate_id) VALUES (?, ?, ?, ?, ?)",
  );
  db.transaction(() => {
    for (const { chore, memberId } of assignments) {
      insert.run(month, chore.id, chore.name, chore.scope, memberId);
    }
  })();
}

/**
 * Who last held each Chore before `month` (YYYY-MM), by Chore id: the Housemate given its latest Assignment.
 * That is last month's assignee, or the holder of an Overdue Assignment that stood in for the Chore.
 */
export function lastAssigneesBefore(
  db: Database.Database,
  month: string,
): Map<number, string> {
  const rows = db
    .prepare<[string], { chore_id: number; housemate_id: string }>(
      `SELECT chore_id, housemate_id FROM assignments AS a
      WHERE month = (SELECT MAX(month) FROM assignments WHERE chore_id = a.chore_id AND month < ?)`,
    )
    .all(month);
  return new Map(rows.map((row) => [row.chore_id, row.housemate_id]));
}

/** An Assignment as stored, with its Chore's name and Scope as they were when it was given. */
export interface StoredAssignment {
  id: number;
  /** YYYY-MM */
  month: string;
  choreId: number;
  choreName: string;
  choreScope: Scope;
  memberId: string;
  /** When the Housemate completed it, if they have. */
  completedAt: Date | undefined;
}

type AssignmentRow = Omit<StoredAssignment, "completedAt"> & {
  completedAt: string | null;
};

/** Matches Assignments neither completed nor dropped. */
const openClause = "(completed_at IS NULL AND dropped_at IS NULL)";

/** Selects Assignments that match `where`, oldest month first. */
function selectAssignments(
  db: Database.Database,
  where: string,
  ...params: string[]
): StoredAssignment[] {
  return db
    .prepare<string[], AssignmentRow>(
      `SELECT id, month, chore_id AS choreId, chore_name AS choreName, chore_scope AS choreScope,
        housemate_id AS memberId, completed_at AS completedAt
      FROM assignments
      WHERE ${where}
      ORDER BY month, chore_name COLLATE NOCASE, id`,
    )
    .all(...params)
    .map((row) => ({
      ...row,
      completedAt:
        row.completedAt === null ? undefined : new Date(row.completedAt),
    }));
}

/** A Housemate's open Assignments, from any month, oldest month first. */
export function openAssignmentsOf(
  db: Database.Database,
  memberId: string,
): StoredAssignment[] {
  return selectAssignments(db, `housemate_id = ? AND ${openClause}`, memberId);
}

/**
 * The open Assignments given in or before `month` (YYYY-MM), oldest month first.
 * Those given before it are overdue.
 */
export function openAssignmentsThrough(
  db: Database.Database,
  month: string,
): StoredAssignment[] {
  return selectAssignments(db, `${openClause} AND month <= ?`, month);
}

/**
 * The Assignments that make up `month` (YYYY-MM), oldest month first: those given in it,
 * and the Overdue Assignments that stood in for their Chores when it was handed out at `handedOutAt`,
 * which are those still open or completed since.
 */
export function assignmentsOfMonth(
  db: Database.Database,
  { month, handedOutAt }: { month: string; handedOutAt: Date },
): StoredAssignment[] {
  return selectAssignments(
    db,
    `month = ? OR (month < ? AND (${openClause} OR completed_at >= ?))`,
    month,
    month,
    handedOutAt.toISOString(),
  );
}

/** The Assignments completed at or after `since`, oldest month first. */
export function completedSince(
  db: Database.Database,
  since: Date,
): StoredAssignment[] {
  return selectAssignments(db, "completed_at >= ?", since.toISOString());
}

/** An Assignment as a line of a list, marked as overdue if it was given before `month` (YYYY-MM). */
export function assignmentLine(
  assignment: StoredAssignment,
  month: string,
): string {
  const scope = scopeLabels[assignment.choreScope];
  const label =
    assignment.month < month
      ? `${scope}, overdue from ${nameMonth(parseMonth(assignment.month))}`
      : scope;
  return `- ${escapeMarkdown(assignment.choreName)} (${label})`;
}

/**
 * The Assignment a Housemate means by a Chore name, ignoring case.
 * That is their own oldest open Assignment of that name if they have one.
 * Otherwise it is the latest one that is either open or given in `month`, whoever holds it,
 * so the refusal can say who holds it or that it is already complete.
 */
export function findAssignment(
  db: Database.Database,
  {
    memberId,
    choreName,
    month,
  }: {
    memberId: string;
    choreName: string;
    /** The current month, YYYY-MM. */
    month: string;
  },
): StoredAssignment | undefined {
  const named = selectAssignments(
    db,
    `${openClause} OR month = ?`,
    month,
  ).filter((a) => sameChoreName(a.choreName, choreName));
  return (
    named.find((a) => a.memberId === memberId && !a.completedAt) ?? named.at(-1)
  );
}

/** Marks an open Assignment complete. */
export function completeAssignment(
  db: Database.Database,
  id: number,
  completedAt: Date,
): void {
  db.prepare(
    `UPDATE assignments SET completed_at = ? WHERE id = ? AND ${openClause}`,
  ).run(completedAt.toISOString(), id);
}

/** Deletes the open Assignments given in `month` (YYYY-MM), so their Chores can be handed out again. */
export function discardOpenAssignments(
  db: Database.Database,
  month: string,
): void {
  db.prepare(`DELETE FROM assignments WHERE month = ? AND ${openClause}`).run(
    month,
  );
}

/** Marks a completed Assignment open again. */
export function reopenAssignment(db: Database.Database, id: number): void {
  db.prepare("UPDATE assignments SET completed_at = NULL WHERE id = ?").run(id);
}

/** Drops open Overdue Assignments, so they no longer stand in for their Chores. */
export function dropAssignments(
  db: Database.Database,
  ids: readonly number[],
  droppedAt: Date,
): void {
  const drop = db.prepare<[string, number]>(
    `UPDATE assignments SET dropped_at = ? WHERE id = ? AND ${openClause}`,
  );
  db.transaction(() => {
    for (const id of ids) drop.run(droppedAt.toISOString(), id);
  })();
}
