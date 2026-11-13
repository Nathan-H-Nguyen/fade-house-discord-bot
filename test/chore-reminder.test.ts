import { expect, test } from "vitest";
import type { DirectMessage, Outbound, Scope } from "../src/house/index.ts";
import {
  createTestHouse,
  membersNamed,
  temporaryPath,
  type TestHouse,
} from "./harness.ts";

/**
 * A House just after the monthly run on the 1st of `month` (YYYY-MM), where Alice has Bathroom and Kitchen
 * and Chloe has Hallway and Stairs: Chloe's two Floor 3 Chores leave the Global one to Alice.
 * The House first starts in the month before, so the jobs are already scheduled.
 */
async function houseIn(
  month: string,
  { databasePath = ":memory:" }: { databasePath?: string } = {},
): Promise<TestHouse> {
  const [year = 0, monthNumber = 0] = month.split("-").map(Number);
  const before = new Date(Date.UTC(year, monthNumber - 1, 0));
  const house = createTestHouse({
    databasePath,
    now: `${before.toISOString().slice(0, 10)}T10:00:00-08:00`,
  });
  await house.tick();
  const chores: Record<string, Scope> = {
    Bathroom: "floor-1",
    Hallway: "floor-3",
    Stairs: "floor-3",
    Kitchen: "global",
  };
  for (const [choreName, scope] of Object.entries(chores)) {
    await house.run("Alice", { name: "chore add", choreName, scope });
  }
  house.setTime(`${month}-01T00:05:00-08:00`);
  await house.tick({ members: membersNamed("Alice", "Chloe") });
  return house;
}

/** Moves the Clock to `time` and ticks, returning only the Chore Reminders sent. */
async function remindersAt(
  house: TestHouse,
  time: string,
  members = membersNamed("Alice", "Chloe"),
): Promise<DirectMessage[]> {
  house.setTime(time);
  const outbound: Outbound[] = await house.tick({ members });
  return outbound.filter(
    (m): m is DirectMessage =>
      "memberId" in m && m.content.startsWith("Reminder:"),
  );
}

test("at 09:00 seven days before the last day of the month, each Housemate is DMed their open Assignments", async () => {
  const house = await houseIn("2026-11");

  expect(await remindersAt(house, "2026-11-23T08:59:00-08:00")).toEqual([]);
  expect(await remindersAt(house, "2026-11-23T09:00:00-08:00")).toEqual([
    {
      memberId: "1001",
      content: [
        "Reminder: a week is left in November 2026. Your open Assignments:",
        "- Bathroom (Floor 1)",
        "- Kitchen (Global)",
      ].join("\n"),
      ifUndelivered: {
        channel: "chores",
        content: [
          "Could not DM <@1001> their reminder. Their open Assignments, with a week left in November 2026:",
          "- Bathroom (Floor 1)",
          "- Kitchen (Global)",
        ].join("\n"),
      },
    },
    {
      memberId: "3001",
      content: [
        "Reminder: a week is left in November 2026. Your open Assignments:",
        "- Hallway (Floor 3)",
        "- Stairs (Floor 3)",
      ].join("\n"),
      ifUndelivered: {
        channel: "chores",
        content: [
          "Could not DM <@3001> their reminder. Their open Assignments, with a week left in November 2026:",
          "- Hallway (Floor 3)",
          "- Stairs (Floor 3)",
        ].join("\n"),
      },
    },
  ]);
});

test.each([
  { length: "28-day", month: "2027-02", day: "2027-02-21" },
  { length: "29-day", month: "2028-02", day: "2028-02-22" },
  { length: "30-day", month: "2027-04", day: "2027-04-23" },
  { length: "31-day", month: "2026-12", day: "2026-12-24" },
  { length: "31-day", month: "2027-01", day: "2027-01-24" },
])(
  "in $month, a $length month, the reminder goes out on $day at 09:00 house time",
  async ({ month, day }) => {
    const house = await houseIn(month);
    // Daylight saving time is in effect in April.
    const offset = month.endsWith("-04") ? "-07:00" : "-08:00";

    expect(await remindersAt(house, `${day}T08:59:00${offset}`)).toEqual([]);
    expect(
      (await remindersAt(house, `${day}T09:00:00${offset}`)).map(
        (m) => m.memberId,
      ),
    ).toEqual(["1001", "3001"]);
  },
);

test("a Housemate with no open Assignments gets no reminder", async () => {
  const house = await houseIn("2026-11");
  for (const choreName of ["Bathroom", "Kitchen"]) {
    await house.run("Alice", { name: "chore done", choreName });
  }

  const reminders = await remindersAt(house, "2026-11-23T09:00:00-08:00", [
    ...membersNamed("Alice", "Ben", "Chloe"),
  ]);

  expect(reminders.map((m) => m.memberId)).toEqual(["3001"]);
});

test("the reminder lists Overdue Assignments, marked, and skips members who have left", async () => {
  const house = await houseIn("2026-11");
  house.setTime("2026-12-01T00:05:00-08:00");
  await house.tick({ members: membersNamed("Alice", "Chloe") });

  // Chloe has left, so only Alice, whose November Assignments are now overdue, is reminded.
  const reminders = await remindersAt(
    house,
    "2026-12-24T09:00:00-08:00",
    membersNamed("Alice"),
  );

  expect(reminders.map((m) => [m.memberId, m.content])).toEqual([
    [
      "1001",
      [
        "Reminder: a week is left in December 2026. Your open Assignments:",
        "- Bathroom (Floor 1, overdue from November 2026)",
        "- Kitchen (Global, overdue from November 2026)",
      ].join("\n"),
    ],
  ]);
});

test("the reminder goes out at most once per month, even across restarts", async () => {
  const databasePath = temporaryPath("fade-house.db");
  const first = await houseIn("2026-11", { databasePath });
  expect(await remindersAt(first, "2026-11-23T09:00:00-08:00")).toHaveLength(2);
  expect(await remindersAt(first, "2026-11-23T09:01:00-08:00")).toEqual([]);
  await first.close();

  const second = createTestHouse({
    databasePath,
    now: "2026-11-24T09:00:00-08:00",
  });

  expect(await remindersAt(second, "2026-11-24T09:00:00-08:00")).toEqual([]);
  expect(await remindersAt(second, "2026-11-30T23:59:00-08:00")).toEqual([]);
});

test("after downtime over the reminder time, the reminder goes out once when the bot comes back", async () => {
  const house = await houseIn("2026-11");

  expect(await remindersAt(house, "2026-11-22T09:00:00-08:00")).toEqual([]);
  expect(await remindersAt(house, "2026-11-26T14:00:00-08:00")).toHaveLength(2);
  expect(await remindersAt(house, "2026-11-27T09:00:00-08:00")).toEqual([]);
});

test("a reminder missed until the month has ended is not sent", async () => {
  const house = await houseIn("2026-11");

  expect(await remindersAt(house, "2026-11-22T09:00:00-08:00")).toEqual([]);
  expect(await remindersAt(house, "2026-12-05T09:00:00-08:00")).toEqual([]);
});

test("a member with both floor roles is reminded of the Assignments they keep", async () => {
  const house = await houseIn("2026-11");
  const [alice, chloe] = membersNamed("Alice", "Chloe");
  if (!alice || !chloe) throw new Error("The roster fixture has changed");
  const members = [{ ...alice, roleNames: ["Floor 1", "Floor 3"] }, chloe];
  for (const choreName of ["Hallway", "Stairs"]) {
    await house.run("Chloe", { name: "chore done", choreName });
  }
  house.setTime("2026-12-01T00:05:00-08:00");
  await house.tick({ members });

  const reminders = await remindersAt(
    house,
    "2026-12-24T09:00:00-08:00",
    members,
  );

  expect(reminders.find((m) => m.memberId === "1001")?.content).toBe(
    [
      "Reminder: a week is left in December 2026. Your open Assignments:",
      "- Bathroom (Floor 1, overdue from November 2026)",
      "- Kitchen (Global, overdue from November 2026)",
    ].join("\n"),
  );
});
