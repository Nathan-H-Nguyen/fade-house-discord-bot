import type Database from "better-sqlite3";
import {
  formatDate,
  formatDateTime,
  formatMonth,
  formatTime,
  lastDay,
  nameDay,
  nameMonth,
  nextMonth,
  previousMonth,
  type LocalDate,
  type LocalDateTime,
  type Month,
} from "./calendar.ts";
import { stayingMembersIn, type Housemate } from "./housemates.ts";
import type { Post, Roster } from "./index.ts";
import { mention } from "./markdown.ts";

/** Each Housemate's Rent in cents, by member ID. Housemates without Rent set are absent. */
export function rents(db: Database.Database): Map<string, number> {
  const rows = db
    .prepare<[], { housemate_id: string; amount_cents: number }>(
      "SELECT housemate_id, amount_cents FROM rents",
    )
    .all();
  return new Map(rows.map((r) => [r.housemate_id, r.amount_cents]));
}

/** A Housemate's Rent in cents, or undefined if it has not been set. */
export function rentOf(
  db: Database.Database,
  memberId: string,
): number | undefined {
  return db
    .prepare<[string], { amount_cents: number }>(
      "SELECT amount_cents FROM rents WHERE housemate_id = ?",
    )
    .get(memberId)?.amount_cents;
}

export function setRent(
  db: Database.Database,
  memberId: string,
  cents: number,
): void {
  db.prepare(
    `INSERT INTO rents (housemate_id, amount_cents) VALUES (?, ?)
     ON CONFLICT (housemate_id) DO UPDATE SET amount_cents = excluded.amount_cents`,
  ).run(memberId, cents);
}

/** The most Rent a Housemate can owe: far above any real Rent, it catches a mistyped amount. */
export const maxRentCents = 100_000 * 100;

/** Reads a dollar amount such as 1250, $1,250 or 1250.5, in cents, or undefined if it is not one. */
export function parseDollars(text: string): number | undefined {
  const match = /^\$?(\d+|\d{1,3}(?:,\d{3})+)(?:\.(\d{1,2}))?$/.exec(
    text.trim(),
  );
  if (!match) return undefined;
  const [, dollars = "", cents = ""] = match;
  return (
    Number(dollars.replaceAll(",", "")) * 100 + Number(cents.padEnd(2, "0"))
  );
}

const dollarFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

/** Shows cents as dollars, such as $1,250.00. */
export function formatDollars(cents: number): string {
  return dollarFormat.format(cents / 100);
}

/** Whether a Housemate has paid their Rent for the current rent period, flagged unless they have. */
export type RentStatus = "paid" | "not paid" | "overdue";

/**
 * A Housemate's line in the Rent list, flagging Rent that has not been set,
 * with their `status` for the current rent period if one has started.
 */
export function rentLine(
  housemate: Housemate,
  cents: number | undefined,
  status?: RentStatus,
): string {
  const who = `- ${mention(housemate.member.id)} (Floor ${String(housemate.floor)})`;
  if (cents === undefined) return `${who}: **no Rent set**`;
  const flag =
    status === undefined
      ? ""
      : status === "paid"
        ? ", paid"
        : `, **${status}**`;
  return `${who}: ${formatDollars(cents)}${flag}`;
}

/** The house time each rent period starts, and Rent Reminders go out every day. */
export const rentReminderTime = { hour: 9, minute: 0 } as const;

/**
 * The stretch in which one month's Rent is reminded of and paid, named after that month.
 * It runs from 09:00 three days before the end of the month before until the next one starts.
 */
export interface RentPeriod {
  month: Month;
  /** The month as YYYY-MM, which names the period in the database and the scheduler. */
  key: string;
  start: LocalDateTime;
  due: LocalDate;
}

/** The rent period for `month`'s Rent. */
export function rentPeriodFor(month: Month): RentPeriod {
  const before = previousMonth(month);
  return {
    month: { year: month.year, month: month.month },
    key: formatMonth(month),
    start: { ...before, day: lastDay(before) - 3, ...rentReminderTime },
    due: { year: month.year, month: month.month, day: 1 },
  };
}

/** The rent period under way at `now`: the latest to have started. */
export function rentPeriodAt(now: LocalDateTime): RentPeriod {
  const next = rentPeriodFor(nextMonth(now));
  // Both are YYYY-MM-DD HH:MM, so they compare as text.
  return formatDateTime(now) >= formatDateTime(next.start)
    ? next
    : rentPeriodFor(now);
}

/** The rent period after `period`. */
export function nextRentPeriod(period: RentPeriod): RentPeriod {
  return rentPeriodFor(nextMonth(period.month));
}

/** When `period` starts, as Housemates read it, such as "November 27 at 09:00". */
export function nameRentPeriodStart(period: RentPeriod): string {
  return `${nameDay(period.start)} at ${formatTime(period.start)}`;
}

/** Whether `period`'s Rent is overdue on `date`: any day after its Due Date. */
export function isRentOverdue(period: RentPeriod, date: LocalDate): boolean {
  // Both are YYYY-MM-DD, so they compare as text.
  return formatDate(date) > formatDate(period.due);
}

/** A Housemate's status for `period` on `date`, given whether they have paid. */
export function rentStatus(
  period: RentPeriod,
  { paid, on }: { paid: boolean; on: LocalDate },
): RentStatus {
  if (paid) return "paid";
  return isRentOverdue(period, on) ? "overdue" : "not paid";
}

/** Records that `period` has started, so its Rent can be reminded of and paid. */
export function startRentPeriod(
  db: Database.Database,
  period: RentPeriod,
): void {
  db.prepare("INSERT OR IGNORE INTO rent_periods (month) VALUES (?)").run(
    period.key,
  );
}

/** Whether the bot has started `period`, which it does only for periods starting after it first ran. */
export function hasRentPeriodStarted(
  db: Database.Database,
  period: RentPeriod,
): boolean {
  return (
    db
      .prepare<[string], 1>("SELECT 1 FROM rent_periods WHERE month = ?")
      .get(period.key) !== undefined
  );
}

/** The member IDs of those who have paid their Rent for `period`. */
export function paidRent(
  db: Database.Database,
  period: RentPeriod,
): Set<string> {
  return new Set(
    db
      .prepare<[string], string>(
        "SELECT housemate_id FROM rent_payments WHERE month = ?",
      )
      .pluck()
      .all(period.key),
  );
}

/** Records that a member has paid their Rent for `period`, which must have started. */
export function payRent(
  db: Database.Database,
  { memberId, period }: { memberId: string; period: RentPeriod },
  at: Date,
): void {
  db.prepare(
    "INSERT INTO rent_payments (month, housemate_id, paid_at) VALUES (?, ?, ?)",
  ).run(period.key, memberId, at.toISOString());
}

/**
 * The first time every member in the roster with Rent who has not left has paid for `period`,
 * records it and returns the post for #chores saying so; otherwise undefined.
 * Members who have left are not waited on, but members with both floor roles are.
 */
export function markAllPaid(
  db: Database.Database,
  { period, roster }: { period: RentPeriod; roster: Roster },
  at: Date,
): Post | undefined {
  const marked = db
    .prepare<[string], string | null>(
      "SELECT all_paid_at FROM rent_periods WHERE month = ?",
    )
    .pluck()
    .get(period.key);
  // Undefined when the period has not started, and a time once it has been marked.
  if (marked !== null) return undefined;

  const amounts = rents(db);
  const paid = paidRent(db, period);
  const owing = stayingMembersIn(roster).filter((m) => amounts.has(m.id));
  if (owing.length === 0 || owing.some((m) => !paid.has(m.id))) {
    return undefined;
  }
  db.prepare("UPDATE rent_periods SET all_paid_at = ? WHERE month = ?").run(
    at.toISOString(),
    period.key,
  );
  return {
    channel: "chores",
    content: `Everyone has paid their Rent for ${nameMonth(period.month)}.`,
  };
}
