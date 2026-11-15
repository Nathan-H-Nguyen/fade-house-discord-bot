import type Database from "better-sqlite3";
import { assignmentLine, openAssignmentsOf } from "./assignments.ts";
import {
  formatDateTime,
  formatMonth,
  lastDay,
  nameMonth,
  type LocalDateTime,
  type Month,
} from "./calendar.ts";
import { stayingMembersIn } from "./housemates.ts";
import type { DirectMessage, Roster } from "./index.ts";
import { mention } from "./markdown.ts";

/** The house time both Chore Reminders go out. */
export const choreReminderTime = { hour: 9, minute: 0 } as const;

/** The day of each month the mid-month Chore Reminder goes out. */
export const midMonthReminderDay = 15;

/** The day of `month` the week-left Chore Reminder goes out: seven days before its last day. */
export function reminderDay(month: Month): number {
  return lastDay(month) - 7;
}

/** Which of a month's two Chore Reminders is sent: the one on the 15th, or the one with a week left. */
export type ChoreReminder = "mid-month" | "week-left";

/** How each Chore Reminder describes how far through `monthName` it is, in the DM and in the fallback post. */
const progress: Record<
  ChoreReminder,
  (monthName: string) => { dm: string; fallback: string }
> = {
  "mid-month": (monthName) => ({
    dm: `${monthName} is half over.`,
    fallback: `with ${monthName} half over`,
  }),
  "week-left": (monthName) => ({
    dm: `a week is left in ${monthName}.`,
    fallback: `with a week left in ${monthName}`,
  }),
};

/**
 * Sends `reminder`: DMs each member who has not left, and has any open Assignments, a list of them, Overdue ones marked.
 * Members with nothing open, and those who have left, get nothing.
 * Nobody is reminded once `month` has ended, such as when the bot was off until after it,
 * and the mid-month reminder is not sent once the week-left one is due, so the two never arrive together.
 */
export function remindOfChores(
  db: Database.Database,
  {
    reminder,
    month,
    now,
    roster,
  }: {
    reminder: ChoreReminder;
    month: Month;
    /** The current time in the house timezone. */
    now: LocalDateTime;
    roster: Roster;
  },
): DirectMessage[] {
  const key = formatMonth(month);
  if (formatMonth(now) !== key) return [];
  const weekLeftStart = {
    ...month,
    day: reminderDay(month),
    ...choreReminderTime,
  };
  // Both are YYYY-MM-DD HH:MM, so they compare as text.
  if (
    reminder === "mid-month" &&
    formatDateTime(now) >= formatDateTime(weekLeftStart)
  ) {
    return [];
  }
  const { dm, fallback } = progress[reminder](nameMonth(month));
  return stayingMembersIn(roster).flatMap((member) => {
    const lines = openAssignmentsOf(db, member.id).map((a) =>
      assignmentLine(a, key),
    );
    if (lines.length === 0) return [];
    return [
      {
        memberId: member.id,
        content: [`Reminder: ${dm} Your open Assignments:`, ...lines].join(
          "\n",
        ),
        ifUndelivered: {
          channel: "chores",
          content: [
            `Could not DM ${mention(member.id)} their reminder. Their open Assignments, ${fallback}:`,
            ...lines,
          ].join("\n"),
        },
      },
    ];
  });
}
