import type Database from "better-sqlite3";
import { assignmentLine, openAssignmentsOf } from "./assignments.ts";
import { formatMonth, lastDay, nameMonth, type Month } from "./calendar.ts";
import { stayingMembersIn } from "./housemates.ts";
import type { DirectMessage, Roster } from "./index.ts";
import { mention } from "./markdown.ts";

/** The day of `month` the Chore Reminder goes out: seven days before its last day. */
export function reminderDay(month: Month): number {
  return lastDay(month) - 7;
}

/**
 * DMs each member who has not left, and has any open Assignments, a list of them, Overdue ones marked.
 * Members with nothing open, and those who have left, get nothing.
 * Nobody is reminded once `month` has ended, such as when the bot was off until after it.
 */
export function remindOfChores(
  db: Database.Database,
  {
    month,
    today,
    roster,
  }: {
    month: Month;
    /** The current month in the house timezone. */
    today: Month;
    roster: Roster;
  },
): DirectMessage[] {
  const key = formatMonth(month);
  if (formatMonth(today) !== key) return [];
  const monthName = nameMonth(month);
  return stayingMembersIn(roster).flatMap((member) => {
    const lines = openAssignmentsOf(db, member.id).map((a) =>
      assignmentLine(a, key),
    );
    if (lines.length === 0) return [];
    return [
      {
        memberId: member.id,
        content: [
          `Reminder: a week is left in ${monthName}. Your open Assignments:`,
          ...lines,
        ].join("\n"),
        ifUndelivered: {
          channel: "chores",
          content: [
            `Could not DM ${mention(member.id)} their reminder. Their open Assignments, with a week left in ${monthName}:`,
            ...lines,
          ].join("\n"),
        },
      },
    ];
  });
}
