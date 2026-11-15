import type Database from "better-sqlite3";
import { assignmentLine, openAssignmentsOf } from "./assignments.ts";
import {
  formatMonth,
  isAtOrAfter,
  lastDay,
  nameMonth,
  type LocalDateTime,
  type Month,
} from "./calendar.ts";
import { stayingMembersIn } from "./housemates.ts";
import type { DirectMessage, Roster } from "./index.ts";
import { mention } from "./markdown.ts";

/** Which of a month's two Chore Reminders is sent: the one on the 15th, or the one with a week left. */
export type ChoreReminder = "mid-month" | "week-left";

/** The house time both Chore Reminders go out. */
const choreReminderTime = { hour: 9, minute: 0 } as const;

/** The day of `month` each Chore Reminder goes out: the 15th, or seven days before its last day. */
const choreReminderDay: Record<ChoreReminder, (month: Month) => number> = {
  "mid-month": () => 15,
  "week-left": (month) => lastDay(month) - 7,
};

/** When `reminder` goes out in `month`. */
export function choreReminderStart(
  reminder: ChoreReminder,
  month: Month,
): LocalDateTime {
  return {
    year: month.year,
    month: month.month,
    day: choreReminderDay[reminder](month),
    ...choreReminderTime,
  };
}

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
  if (
    reminder === "mid-month" &&
    isAtOrAfter(now, choreReminderStart("week-left", month))
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
