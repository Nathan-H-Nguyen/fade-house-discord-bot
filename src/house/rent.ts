import type Database from "better-sqlite3";
import {
  formatDate,
  formatDateTime,
  formatMonth,
  lastDay,
  nameMonth,
  nextMonth,
  parseMonth,
  previousMonth,
  type LocalDate,
  type LocalDateTime,
  type Month,
} from "./calendar.ts";
import { housematesIn, type Housemate } from "./housemates.ts";
import type { Post, Roster } from "./index.ts";
import { mention } from "./markdown.ts";
import type { Period } from "./scheduler.ts";

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

/** When the rent period for `month` starts: 09:00 three days before the end of the month before. */
export function rentPeriodStart(month: Month): LocalDateTime {
  const before = previousMonth(month);
  return { ...before, day: lastDay(before) - 3, hour: 9, minute: 0 };
}

/** The Due Date of the Rent for `month`: its 1st. */
export function dueDate(month: Month): LocalDate {
  return { year: month.year, month: month.month, day: 1 };
}

/** Whether the Rent for `month` is overdue on `date`: any day after its Due Date. */
export function isRentOverdue(month: Month, date: LocalDate): boolean {
  // Both are YYYY-MM-DD, so they compare as text.
  return formatDate(date) > formatDate(dueDate(month));
}

/** The month whose rent period is under way at `now`: the latest to have started. */
export function rentMonthAt(now: LocalDateTime): Month {
  const next = nextMonth(now);
  // Both are YYYY-MM-DD HH:MM, so they compare as text.
  return formatDateTime(now) >= formatDateTime(rentPeriodStart(next))
    ? next
    : { year: now.year, month: now.month };
}

/** Rent periods as the scheduler sees them: named by the month the Rent is for. */
export function rentPeriodAt(now: LocalDateTime): Period {
  const month = rentMonthAt(now);
  return { key: formatMonth(month), start: rentPeriodStart(month) };
}

/** Records that the rent period for `month` (YYYY-MM) has started, so its Rent can be reminded of and paid. */
export function startRentPeriod(db: Database.Database, month: string): void {
  db.prepare("INSERT OR IGNORE INTO rent_periods (month) VALUES (?)").run(
    month,
  );
}

/** Whether the bot has started the rent period for `month` (YYYY-MM). */
export function hasRentPeriodStarted(
  db: Database.Database,
  month: string,
): boolean {
  return (
    db
      .prepare<[string], 1>("SELECT 1 FROM rent_periods WHERE month = ?")
      .get(month) !== undefined
  );
}

/** The member IDs of those who have paid their Rent for `month` (YYYY-MM). */
export function paidRent(db: Database.Database, month: string): Set<string> {
  return new Set(
    db
      .prepare<[string], string>(
        "SELECT housemate_id FROM rent_payments WHERE month = ?",
      )
      .pluck()
      .all(month),
  );
}

export function payRent(
  db: Database.Database,
  { memberId, month }: { memberId: string; month: string },
  at: Date,
): void {
  db.prepare(
    "INSERT INTO rent_payments (month, housemate_id, paid_at) VALUES (?, ?, ?)",
  ).run(month, memberId, at.toISOString());
}

/**
 * The post for #chores saying everyone has paid their Rent for `month` (YYYY-MM), the first time every Housemate
 * in the roster with Rent has paid for it, or undefined. Members who have left are not waited on.
 */
export function announceAllPaid(
  db: Database.Database,
  { month, roster }: { month: string; roster: Roster },
  at: Date,
): Post | undefined {
  const announced = db
    .prepare<[string], string | null>(
      "SELECT all_paid_at FROM rent_periods WHERE month = ?",
    )
    .pluck()
    .get(month);
  // Undefined when the period has not started, and a time once it has been announced.
  if (announced !== null) return undefined;

  const amounts = rents(db);
  const paid = paidRent(db, month);
  const owing = housematesIn(roster).housemates.filter((h) =>
    amounts.has(h.member.id),
  );
  if (owing.length === 0 || owing.some((h) => !paid.has(h.member.id))) {
    return undefined;
  }
  db.prepare("UPDATE rent_periods SET all_paid_at = ? WHERE month = ?").run(
    at.toISOString(),
    month,
  );
  return {
    channel: "chores",
    content: `Everyone has paid their Rent for ${nameMonth(parseMonth(month))}.`,
  };
}
