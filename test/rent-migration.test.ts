import Database from "better-sqlite3";
import { expect, test } from "vitest";
import { createTestHouse, temporaryPath } from "./harness.ts";

/** The schema version of the last release that named a rent period after the month its Rent was due in. */
const dueMonthSchemaVersion = 10;

test("Rent recorded when periods were named after the month due is moved to the month it was for", async () => {
  const databasePath = temporaryPath("house.db");
  const setUp = createTestHouse({ databasePath });
  await setUp.run(
    "Alice",
    { name: "rent set", memberId: "3001", amount: "900" },
    { isAdmin: true },
  );
  await setUp.close();
  // Chloe paid in the periods that started September 27 and October 28, which that release named
  // October and November 2026. The later is stored first, as a restored backup can order them.
  const raw = new Database(databasePath);
  raw.exec(`
    INSERT INTO rent_periods (month, all_paid_at) VALUES ('2026-11', '2026-10-29T17:00:00.000Z');
    INSERT INTO rent_periods (month, all_paid_at) VALUES ('2026-10', '2026-09-28T17:00:00.000Z');
    INSERT INTO rent_payments (month, housemate_id, paid_at) VALUES ('2026-11', '3001', '2026-10-29T17:00:00.000Z');
    INSERT INTO rent_payments (month, housemate_id, paid_at) VALUES ('2026-10', '3001', '2026-09-28T17:00:00.000Z');
    PRAGMA user_version = ${String(dueMonthSchemaVersion)};
  `);
  raw.close();

  const house = createTestHouse({
    databasePath,
    now: "2026-11-14T10:00:00-08:00",
  });
  const novemberList = await house.run("Ben", { name: "rent list" });
  const november = await house.run("Chloe", { name: "rent paid" });
  house.setTime("2026-10-29T10:00:00-07:00");
  const october = await house.run("Ben", { name: "rent list" });
  house.setTime("2026-09-28T10:00:00-07:00");
  const september = await house.run("Ben", { name: "rent list" });
  await house.close();

  expect(novemberList.reply.content).toContain(
    "- <@3001> (Floor 3): $900.00, **not paid**",
  );
  expect(november.reply.content).toBe(
    "Marked your Rent for November 2026 paid.",
  );
  for (const list of [october, september]) {
    expect(list.reply.content).toContain("- <@3001> (Floor 3): $900.00, paid");
  }
});
