import type Database from "better-sqlite3";
import {
  formatMonth,
  lastDay,
  nameMonth,
  nextMonth,
  type LocalDate,
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

/**
 * A Housemate's line in the Rent list, flagging Rent that has not been set,
 * and whether they have paid for the current month if `paid` is given.
 */
export function rentLine(
  housemate: Housemate,
  cents: number | undefined,
  paid?: boolean,
): string {
  const who = `- ${mention(housemate.member.id)} (Floor ${String(housemate.floor)})`;
  if (cents === undefined) return `${who}: **no Rent set**`;
  const flag = paid === undefined ? "" : paid ? ", paid" : ", **not paid**";
  return `${who}: ${formatDollars(cents)}${flag}`;
}

/** The house time Rent Reminders go out every day. */
export const rentReminderTime = { hour: 9, minute: 0 } as const;

/** How many days before the Due Date Rent Reminders start. */
const reminderDaysBeforeDue = 3;

/** One calendar month's Rent, which is paid during that month and forgotten once it ends. */
export interface RentPeriod {
  month: Month;
  /** The month as YYYY-MM, which names the period in the database. */
  key: string;
  /** The last day of the month. */
  due: LocalDate;
}

/** The rent period for `month`'s Rent. */
export function rentPeriodFor(month: Month): RentPeriod {
  return {
    month: { year: month.year, month: month.month },
    key: formatMonth(month),
    due: { year: month.year, month: month.month, day: lastDay(month) },
  };
}

/** The rent period after `period`. */
export function nextRentPeriod(period: RentPeriod): RentPeriod {
  return rentPeriodFor(nextMonth(period.month));
}

/** Whether Rent Reminders go out on `date`: from three days before its month's Due Date until the Due Date. */
export function isRentReminderDay(date: LocalDate): boolean {
  return date.day >= lastDay(date) - reminderDaysBeforeDue;
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

/**
 * Records that a member has paid their Rent for `period`, returning the posts for #rent:
 * that they have paid, then that everyone has if they were the last.
 */
export function payRent(
  db: Database.Database,
  {
    memberId,
    period,
    roster,
  }: { memberId: string; period: RentPeriod; roster: Roster },
  at: Date,
): Post[] {
  db.prepare("INSERT OR IGNORE INTO rent_periods (month) VALUES (?)").run(
    period.key,
  );
  db.prepare(
    "INSERT INTO rent_payments (month, housemate_id, paid_at) VALUES (?, ?, ?)",
  ).run(period.key, memberId, at.toISOString());
  const paid: Post = {
    channel: "rent",
    content: `${mention(memberId)} has paid their Rent for ${nameMonth(period.month)}.`,
  };
  const allPaid = markAllPaid(db, { period, roster }, at);
  return allPaid ? [paid, allPaid] : [paid];
}

/** Removes a member's payment for `period`, so they owe its Rent again. */
export function unpayRent(
  db: Database.Database,
  { memberId, period }: { memberId: string; period: RentPeriod },
): void {
  db.prepare(
    "DELETE FROM rent_payments WHERE month = ? AND housemate_id = ?",
  ).run(period.key, memberId);
}

/**
 * The first time every member in the roster with Rent who has not left has paid for `period`,
 * records it and returns the post for #rent saying so; otherwise undefined.
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
  // Undefined when nobody has paid for the period yet, and a time once it has been marked.
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
    channel: "rent",
    content: `Everyone has paid their Rent for ${nameMonth(period.month)}.`,
  };
}
