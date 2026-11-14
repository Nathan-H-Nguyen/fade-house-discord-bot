import type Database from "better-sqlite3";
import type { Housemate } from "./housemates.ts";
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

/** A Housemate's line in the Rent list, flagging Rent that has not been set. */
export function rentLine(
  housemate: Housemate,
  cents: number | undefined,
): string {
  const amount = cents === undefined ? "**no Rent set**" : formatDollars(cents);
  return `- ${mention(housemate.member.id)} (Floor ${String(housemate.floor)}): ${amount}`;
}
