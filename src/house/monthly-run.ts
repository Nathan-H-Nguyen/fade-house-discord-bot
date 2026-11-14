import type Database from "better-sqlite3";
import {
  assignmentLine,
  assignmentsOfMonth,
  completedSince,
  discardOpenAssignments,
  dropAssignments,
  lastAssigneesBefore,
  openAssignmentsThrough,
  planAssignments,
  saveAssignments,
  type Random,
  type StoredAssignment,
} from "./assignments.ts";
import {
  formatMonth,
  nameMonth,
  previousMonth,
  type Calendar,
  type Month,
} from "./calendar.ts";
import {
  activeChores,
  foldChoreName,
  scopeLabels,
  type StoredChore,
} from "./chores.ts";
import {
  byFloorThenName,
  floorRoleNames,
  housematesIn,
  stayingMembersIn,
} from "./housemates.ts";
import type { Member, Outbound, Post, Roster } from "./index.ts";
import { escapeMarkdown, mention } from "./markdown.ts";

/** Splits `items` into those that pass `test` and those that do not. */
function partition<T>(
  items: readonly T[],
  test: (item: T) => boolean,
): [T[], T[]] {
  return [items.filter(test), items.filter((item) => !test(item))];
}

function choreLines(chores: readonly StoredChore[]): string[] {
  return [...chores]
    .sort((a, b) => foldChoreName(a.name).localeCompare(foldChoreName(b.name)))
    .map((c) => `- ${escapeMarkdown(c.name)} (${scopeLabels[c.scope]})`);
}

/** The Assignments completed during `month` in the house timezone. */
function completedIn(
  db: Database.Database,
  calendar: Calendar,
  month: Month,
): StoredAssignment[] {
  // The house timezone is less than a day from UTC, so the day before the 1st in UTC is early enough.
  const since = new Date(Date.UTC(month.year, month.month - 1, 0));
  return completedSince(db, since).filter(
    (a) =>
      a.completedAt &&
      formatMonth(calendar.toLocal(a.completedAt)) === formatMonth(month),
  );
}

/**
 * The summary of `month` for #chores: per member, the Assignments they completed during it and those now overdue,
 * then the Overdue Assignments dropped. Members come in `members` order, then any others, such as those who have left.
 * Undefined when there is nothing to list.
 */
function summarise({
  month,
  members,
  completed,
  overdue,
  dropped,
}: {
  month: Month;
  members: readonly Member[];
  completed: readonly StoredAssignment[];
  overdue: readonly StoredAssignment[];
  dropped: readonly StoredAssignment[];
}): Post | undefined {
  const key = formatMonth(month);
  const rank = new Map(members.map((m, i) => [m.id, i]));
  const memberIds = [
    ...new Set([...completed, ...overdue].map((a) => a.memberId)),
  ].sort(
    (a, b) =>
      (rank.get(a) ?? rank.size) - (rank.get(b) ?? rank.size) ||
      a.localeCompare(b),
  );

  const lines = (heading: string, assignments: readonly StoredAssignment[]) =>
    assignments.length > 0
      ? [heading, ...assignments.map((a) => assignmentLine(a, key))]
      : [];
  const sections = memberIds.map((id) =>
    [
      mention(id),
      ...lines(
        "Completed:",
        completed.filter((a) => a.memberId === id),
      ),
      ...lines(
        "Overdue:",
        overdue.filter((a) => a.memberId === id),
      ),
    ].join("\n"),
  );
  if (dropped.length > 0) {
    sections.push(
      [
        "Dropped, because the Housemate has left or the Chore is retired:",
        ...dropped.map(
          (a) => `${assignmentLine(a, key)} from ${mention(a.memberId)}`,
        ),
      ].join("\n"),
    );
  }
  if (sections.length === 0) return undefined;
  return {
    channel: "chores",
    content: [`**Summary of ${nameMonth(month)}**`, ...sections].join("\n\n"),
  };
}

/**
 * Closes out the month before `month`, then gives every active Chore to one eligible Housemate for `month`,
 * except those an Overdue Assignment stands in for.
 * Returns, in order: a summary of the month just ended for #chores, if there is anything to summarise;
 * the post for #chores; a DM to each holder listing their own Assignments, Overdue ones included;
 * and a report in #bot-admin for each member with several floor roles.
 */
export function assignMonth(
  db: Database.Database,
  {
    month,
    roster,
    random,
    calendar,
    now,
  }: {
    month: Month;
    roster: Roster;
    random: Random;
    calendar: Calendar;
    now: Date;
  },
): Outbound[] {
  const key = formatMonth(month);
  const lastMonth = previousMonth(month);
  const housemates = [...housematesIn(roster).housemates].sort(byFloorThenName);
  const members = stayingMembersIn(roster);
  const chores = activeChores(db);

  // Overdue Assignments are dropped when their Housemate has left or their Chore is retired.
  const [overdue, dropped] = partition(
    openAssignmentsThrough(db, key).filter((a) => a.month < key),
    (a) =>
      members.some((m) => m.id === a.memberId) &&
      chores.some((c) => c.id === a.choreId),
  );
  const { assignments, skipped } = planAssignments({
    chores: chores.filter((c) => !overdue.some((a) => a.choreId === c.id)),
    housemates,
    previous: lastAssigneesBefore(db, key),
    random,
  });
  db.transaction(() => {
    dropAssignments(
      db,
      dropped.map((a) => a.id),
      now,
    );
    saveAssignments(db, key, assignments);
  })();

  const summary = summarise({
    month: lastMonth,
    members,
    completed: completedIn(db, calendar, lastMonth),
    overdue,
    dropped,
  });

  return [
    ...(summary ? [summary] : []),
    ...announce(db, { month, roster, skipped, reassigned: false }),
    ...reportMisconfigured(roster, month),
  ];
}

/**
 * Discards the open Assignments given in `month`, keeping those completed and the Overdue Assignments standing in,
 * and hands the active Chores they leave uncovered out again, as the monthly run would.
 * Kept Assignments given in `month` count toward the balance. `handedOutAt` is when the monthly run handed `month` out.
 * Returns the post for #chores and a DM to each holder. Members with several floor roles were reported by the monthly run.
 */
export function reassignMonth(
  db: Database.Database,
  {
    month,
    handedOutAt,
    roster,
    random,
  }: {
    month: Month;
    handedOutAt: Date;
    roster: Roster;
    random: Random;
  },
): Outbound[] {
  const key = formatMonth(month);
  const { skipped } = db.transaction(() => {
    discardOpenAssignments(db, key);
    const kept = assignmentsOfMonth(db, { month: key, handedOutAt });
    const counts = new Map<string, number>();
    for (const { memberId } of kept.filter((a) => a.month === key)) {
      counts.set(memberId, (counts.get(memberId) ?? 0) + 1);
    }
    const plan = planAssignments({
      chores: activeChores(db).filter(
        (c) => !kept.some((a) => a.choreId === c.id),
      ),
      housemates: [...housematesIn(roster).housemates].sort(byFloorThenName),
      previous: lastAssigneesBefore(db, key),
      alreadyGiven: counts,
      random,
    });
    saveAssignments(db, key, plan.assignments);
    return plan;
  })();
  return announce(db, { month, roster, skipped, reassigned: true });
}

/**
 * Announces `month`'s open Assignments, Overdue ones included: the post for #chores, listing any `skipped` Chores,
 * and a DM to each holder listing their own.
 */
function announce(
  db: Database.Database,
  {
    month,
    roster,
    skipped,
    reassigned,
  }: {
    month: Month;
    roster: Roster;
    skipped: readonly StoredChore[];
    /** Whether an Admin handed the month out again, which the post and DMs say. */
    reassigned: boolean;
  },
): Outbound[] {
  const key = formatMonth(month);
  const members = stayingMembersIn(roster);
  const monthName = nameMonth(month);
  const heading = reassigned ? `${monthName}, reassigned` : monthName;
  const open = openAssignmentsThrough(db, key);
  const given = members
    .map((member) => ({
      memberId: member.id,
      lines: open
        .filter((a) => a.memberId === member.id)
        .map((a) => assignmentLine(a, key)),
    }))
    .filter(({ lines }) => lines.length > 0);

  const sections = given.map(({ memberId, lines }) =>
    [mention(memberId), ...lines].join("\n"),
  );
  if (skipped.length > 0) {
    sections.push(
      [
        "Not assigned, because no Housemate is eligible:",
        ...choreLines(skipped),
      ].join("\n"),
    );
  }
  if (sections.length === 0) {
    sections.push(
      reassigned
        ? "There are no open Assignments."
        : "There are no active Chores.",
    );
  }
  const post: Post = {
    channel: "chores",
    content: [`**Chores for ${heading}**`, ...sections].join("\n\n"),
  };

  const dms: Outbound[] = given.map(({ memberId, lines }) => ({
    memberId,
    content: [`Your Chores for ${heading}:`, ...lines].join("\n"),
    ifUndelivered: {
      channel: "chores",
      content: `Could not DM ${mention(memberId)} their Chores for ${monthName}. They are in the post above.`,
    },
  }));

  return [post, ...dms];
}

/** A report in #bot-admin for each member with several floor roles, who were given no new Chores for `month`. */
function reportMisconfigured(roster: Roster, month: Month): Outbound[] {
  return housematesIn(roster).misconfigured.map(({ member, floors }) => ({
    channel: "admin",
    content:
      `${mention(member.id)} has both the ${floorRoleNames(floors)} roles, ` +
      `so they were given no new Chores for ${nameMonth(month)}. Remove one of the roles to include them from next month.`,
  }));
}
