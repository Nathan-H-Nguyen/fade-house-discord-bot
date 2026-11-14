import type Database from "better-sqlite3";
import {
  formatDate,
  nameDay,
  nameMonth,
  type LocalDate,
  type LocalDateTime,
} from "./calendar.ts";
import { byFloorThenName, housematesIn } from "./housemates.ts";
import type { Outbound, Roster } from "./index.ts";
import { mention } from "./markdown.ts";
import {
  formatDollars,
  hasRentPeriodStarted,
  isRentOverdue,
  markAllPaid,
  paidRent,
  rentPeriodAt,
  rents,
} from "./rent.ts";

/**
 * DMs each Housemate with Rent who has not paid for the rent period under way at `at` their amount and Due Date,
 * saying they are overdue once it has passed. Members who are not Housemates get nothing.
 * If everyone left to pay has paid, such as when the last who had not has left, says so in #chores.
 * Nobody is reminded for a rent period the bot has not started, or once the day of `at` has ended,
 * such as when the bot was off until the next morning.
 */
export function remindOfRent(
  db: Database.Database,
  {
    at,
    today,
    roster,
    now,
  }: {
    at: LocalDateTime;
    /** The current date in the house timezone. */
    today: LocalDate;
    roster: Roster;
    now: Date;
  },
): Outbound[] {
  if (formatDate(at) !== formatDate(today)) return [];
  const period = rentPeriodAt(at);
  if (!hasRentPeriodStarted(db, period)) return [];

  const amounts = rents(db);
  const paid = paidRent(db, period);
  const overdue = isRentOverdue(period, at);
  const monthName = nameMonth(period.month);
  const dueName = nameDay(period.due);
  const reminders = [...housematesIn(roster).housemates]
    .sort(byFloorThenName)
    .flatMap(({ member }): Outbound[] => {
      const cents = amounts.get(member.id);
      if (cents === undefined || paid.has(member.id)) return [];
      const amount = formatDollars(cents);
      return [
        {
          memberId: member.id,
          content:
            (overdue
              ? `Reminder: your Rent for ${monthName}, ${amount}, was due ${dueName} and is overdue.`
              : `Reminder: your Rent for ${monthName} is ${amount}, due ${dueName}.`) +
            " Use /rent paid once you have paid it.",
          ifUndelivered: {
            channel: "admin",
            content:
              `Could not DM ${mention(member.id)} their Rent Reminder: ${amount} for ${monthName}, due ${dueName}` +
              (overdue ? " and overdue." : "."),
          },
        },
      ];
    });
  const allPaid = markAllPaid(db, { period, roster }, now);
  return allPaid ? [...reminders, allPaid] : reminders;
}
