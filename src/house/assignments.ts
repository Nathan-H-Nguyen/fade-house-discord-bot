import type Database from "better-sqlite3";
import type { Chore, StoredChore } from "./chores.ts";
import type { Housemate } from "./housemates.ts";

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
  random: Random,
): Assignment[] {
  const counts = new Map<string, number>();
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

/** How uneven the Assignment counts are: the sum of each Housemate's count squared. */
function unevenness(assignments: readonly Assignment[]): number {
  const counts = new Map<string, number>();
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
  random,
}: {
  chores: readonly StoredChore[];
  housemates: readonly Housemate[];
  /** Last month's assignee of each Chore, by Chore id. */
  previous: ReadonlyMap<number, string>;
  random: Random;
}): { assignments: Assignment[]; skipped: StoredChore[] } {
  const skipped = chores.filter(
    (c) => !housemates.some((h) => isEligible(c, h)),
  );
  const assignable = chores.filter((c) => !skipped.includes(c));

  let best: Assignment[] = [];
  let bestUnevenness = Infinity;
  for (let i = 0; i < passes; i++) {
    const assignments = handOut(assignable, housemates, previous, random);
    const score = unevenness(assignments);
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

/** Who each Chore was given to in `month` (YYYY-MM), by Chore id. */
export function assigneesIn(
  db: Database.Database,
  month: string,
): Map<number, string> {
  const rows = db
    .prepare<[string], { chore_id: number; housemate_id: string }>(
      "SELECT chore_id, housemate_id FROM assignments WHERE month = ?",
    )
    .all(month);
  return new Map(rows.map((row) => [row.chore_id, row.housemate_id]));
}
