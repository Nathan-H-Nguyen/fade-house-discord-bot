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
  isRentReminderDay,
  markAllPaid,
  paidRent,
  rentPeriodFor,
  rents,
} from "./rent.ts";

/**
 * From three days before the Due Date until it, DMs each Housemate with Rent who has not paid for the month of `at`
 * their amount and Due Date. Members who are not Housemates get nothing.
 * If everyone left to pay has paid, such as when the last who had not has left, says so in #rent.
 * Nobody is reminded once the day of `at` has ended, such as when the bot was off until the next morning.
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
  const period = rentPeriodFor(at);

  const amounts = rents(db);
  const paid = paidRent(db, period);
  const monthName = nameMonth(period.month);
  const dueName = nameDay(period.due);
  // The all-paid check below runs every day, so a Housemate leaving can complete the month on any day.
  const remindable = isRentReminderDay(at)
    ? [...housematesIn(roster).housemates]
    : [];
  const reminders = remindable
    .sort(byFloorThenName)
    .flatMap(({ member }): Outbound[] => {
      const cents = amounts.get(member.id);
      if (cents === undefined || paid.has(member.id)) return [];
      const amount = formatDollars(cents);
      return [
        {
          memberId: member.id,
          content: [
            "**Rent Reminder**",
            `Your Rent for **${monthName}** is **${amount}**.`,
            `Due: *${dueName}*`,
            "",
            "Use `/rent paid` once you have paid it.",
          ].join("\n"),
          ifUndelivered: {
            channel: "admin",
            content: `Could not DM ${mention(member.id)} their Rent Reminder: ${amount} for ${monthName}, due ${dueName}.`,
          },
        },
      ];
    });
  const allPaid = markAllPaid(db, { period, roster }, now);
  return allPaid ? [...reminders, allPaid] : reminders;
}
