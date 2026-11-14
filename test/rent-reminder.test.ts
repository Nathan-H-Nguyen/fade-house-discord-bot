import { expect, test } from "vitest";
import type { DirectMessage, Outbound } from "../src/house/index.ts";
import {
  createTestHouse,
  membersNamed,
  postsIn,
  type TestHouse,
} from "./harness.ts";

/**
 * A House first started at `startedAt`, so the jobs are already scheduled from then,
 * where an Admin has set Alice's Rent to $1,250 and Chloe's to $900.
 */
async function houseWithRent(
  startedAt = "2026-11-12T10:00:00-08:00",
): Promise<TestHouse> {
  const house = createTestHouse({ now: startedAt });
  await house.tick();
  for (const [memberId, amount] of [
    ["1001", "1250"],
    ["3001", "900"],
  ] as const) {
    await house.run(
      "Alice",
      { name: "rent set", memberId, amount },
      { isAdmin: true },
    );
  }
  return house;
}

/** Moves the Clock to `time` and ticks, returning only the Rent Reminders sent. */
async function rentRemindersAt(
  house: TestHouse,
  time: string,
  members = membersNamed("Alice", "Chloe"),
): Promise<DirectMessage[]> {
  house.setTime(time);
  const outbound: Outbound[] = await house.tick({ members });
  return outbound.filter(
    (m): m is DirectMessage =>
      "memberId" in m && m.content.startsWith("Reminder: your Rent"),
  );
}

test("from 09:00 three days before the end of the month, each unpaid Housemate is DMed their Rent and the Due Date daily, then told they are overdue", async () => {
  const house = await houseWithRent();

  expect(await rentRemindersAt(house, "2026-11-27T08:59:00-08:00")).toEqual([]);
  expect(await rentRemindersAt(house, "2026-11-27T09:00:00-08:00")).toEqual([
    {
      memberId: "1001",
      content:
        "Reminder: your Rent for December 2026 is $1,250.00, due December 1. Use /rent paid once you have paid it.",
      ifUndelivered: {
        channel: "admin",
        content:
          "Could not DM <@1001> their Rent Reminder: $1,250.00 for December 2026, due December 1.",
      },
    },
    {
      memberId: "3001",
      content:
        "Reminder: your Rent for December 2026 is $900.00, due December 1. Use /rent paid once you have paid it.",
      ifUndelivered: {
        channel: "admin",
        content:
          "Could not DM <@3001> their Rent Reminder: $900.00 for December 2026, due December 1.",
      },
    },
  ]);
  expect(await rentRemindersAt(house, "2026-11-27T15:00:00-08:00")).toEqual([]);
  expect(
    (await rentRemindersAt(house, "2026-12-01T09:00:00-08:00")).map(
      (m) => m.content,
    ),
  ).toEqual([
    "Reminder: your Rent for December 2026 is $1,250.00, due December 1. Use /rent paid once you have paid it.",
    "Reminder: your Rent for December 2026 is $900.00, due December 1. Use /rent paid once you have paid it.",
  ]);
  expect(await rentRemindersAt(house, "2026-12-03T09:00:00-08:00")).toEqual([
    {
      memberId: "1001",
      content:
        "Reminder: your Rent for December 2026, $1,250.00, was due December 1 and is overdue. Use /rent paid once you have paid it.",
      ifUndelivered: {
        channel: "admin",
        content:
          "Could not DM <@1001> their Rent Reminder: $1,250.00 for December 2026, due December 1 and overdue.",
      },
    },
    {
      memberId: "3001",
      content:
        "Reminder: your Rent for December 2026, $900.00, was due December 1 and is overdue. Use /rent paid once you have paid it.",
      ifUndelivered: {
        channel: "admin",
        content:
          "Could not DM <@3001> their Rent Reminder: $900.00 for December 2026, due December 1 and overdue.",
      },
    },
  ]);
});

test.each([
  {
    length: "28-day",
    before: "2027-02",
    start: "2027-02-25",
    month: "March 2027",
    due: "March 1",
  },
  {
    length: "29-day",
    before: "2028-02",
    start: "2028-02-26",
    month: "March 2028",
    due: "March 1",
  },
  {
    length: "30-day",
    before: "2027-04",
    start: "2027-04-27",
    month: "May 2027",
    due: "May 1",
  },
  {
    length: "31-day",
    before: "2026-12",
    start: "2026-12-28",
    month: "January 2027",
    due: "January 1",
  },
])(
  "after $before, a $length month, the period for $month starts on $start at 09:00 house time",
  async ({ before, start, month, due }) => {
    const house = await houseWithRent(`${before}-10T10:00:00-08:00`);
    // Daylight saving time is in effect in April.
    const offset = before.endsWith("-04") ? "-07:00" : "-08:00";

    expect(await rentRemindersAt(house, `${start}T08:59:00${offset}`)).toEqual(
      [],
    );
    expect(
      (await rentRemindersAt(house, `${start}T09:00:00${offset}`)).map(
        (m) => m.content,
      ),
    ).toEqual([
      `Reminder: your Rent for ${month} is $1,250.00, due ${due}. Use /rent paid once you have paid it.`,
      `Reminder: your Rent for ${month} is $900.00, due ${due}. Use /rent paid once you have paid it.`,
    ]);
  },
);

test("Rent Reminders run across the year end, overdue from January 2", async () => {
  const house = await houseWithRent("2026-12-10T10:00:00-08:00");
  await rentRemindersAt(house, "2026-12-28T09:00:00-08:00");

  expect(
    (await rentRemindersAt(house, "2027-01-01T09:00:00-08:00")).map(
      (m) => m.content,
    ),
  ).toContain(
    "Reminder: your Rent for January 2027 is $900.00, due January 1. Use /rent paid once you have paid it.",
  );
  expect(
    (await rentRemindersAt(house, "2027-01-02T09:00:00-08:00")).map(
      (m) => m.content,
    ),
  ).toContain(
    "Reminder: your Rent for January 2027, $900.00, was due January 1 and is overdue. Use /rent paid once you have paid it.",
  );
});

test("a Housemate who marks their Rent paid gets no more reminders for that period", async () => {
  const house = await houseWithRent();
  await rentRemindersAt(house, "2026-11-27T09:00:00-08:00");
  house.setTime("2026-11-28T12:00:00-08:00");

  const paid = await house.run("Chloe", { name: "rent paid" });

  expect(paid).toEqual({
    reply: {
      content: "Marked your Rent for December 2026 paid.",
      private: true,
    },
    outbound: [],
  });
  for (const day of ["2026-11-29", "2026-12-03", "2026-12-27"]) {
    expect(
      (await rentRemindersAt(house, `${day}T09:00:00-08:00`)).map(
        (m) => m.memberId,
      ),
    ).toEqual(["1001"]);
  }
  expect(
    (await rentRemindersAt(house, "2026-12-28T09:00:00-08:00")).map((m) => [
      m.memberId,
      m.content,
    ]),
  ).toEqual([
    [
      "1001",
      "Reminder: your Rent for January 2027 is $1,250.00, due January 1. Use /rent paid once you have paid it.",
    ],
    [
      "3001",
      "Reminder: your Rent for January 2027 is $900.00, due January 1. Use /rent paid once you have paid it.",
    ],
  ]);
});

test("marking Rent paid again before the next period starts is refused, naming when it starts", async () => {
  const house = await houseWithRent();
  house.setTime("2026-11-27T09:00:00-08:00");
  await house.tick();
  await house.run("Chloe", { name: "rent paid" });
  house.setTime("2026-12-28T08:59:00-08:00");

  const early = await house.run("Chloe", { name: "rent paid" });

  expect(early).toEqual({
    reply: {
      content:
        "You have already paid your Rent for December 2026. The period for January 2027 starts on December 28 at 09:00, and you can mark it paid then.",
      private: true,
    },
    outbound: [],
  });
});

test("marking Rent paid before the bot's first rent period starts is refused", async () => {
  const house = await houseWithRent();

  const early = await house.run("Chloe", { name: "rent paid" });

  expect(early).toEqual({
    reply: {
      content:
        "The first rent period, for December 2026, starts on November 27 at 09:00, and you can mark your Rent paid then.",
      private: true,
    },
    outbound: [],
  });
});

test("a Housemate without Rent set cannot mark it paid", async () => {
  const house = await houseWithRent();
  house.setTime("2026-11-27T09:00:00-08:00");
  await house.tick();

  const paid = await house.run("Ben", { name: "rent paid" });

  expect(paid).toEqual({
    reply: {
      content: "You have no Rent set. Ask an Admin to set it with /rent set.",
      private: true,
    },
    outbound: [],
  });
});

test("once everyone with Rent has paid, #chores is told once", async () => {
  const house = await houseWithRent();
  house.setTime("2026-11-27T09:00:00-08:00");
  await house.tick();

  const alice = await house.run("Alice", { name: "rent paid" });
  const chloe = await house.run("Chloe", { name: "rent paid" });
  const again = await house.run("Chloe", { name: "rent paid" });
  house.setTime("2026-11-28T09:00:00-08:00");
  const nextDay = await house.tick();

  expect(alice.outbound).toEqual([]);
  expect(chloe.outbound).toEqual([
    {
      channel: "chores",
      content: "Everyone has paid their Rent for December 2026.",
    },
  ]);
  expect(again.outbound).toEqual([]);
  expect(postsIn(nextDay, "chores")).toEqual([]);
});

test("a Housemate who leaves gets no more reminders, and is not waited on for the all-paid message", async () => {
  const house = await houseWithRent();
  await rentRemindersAt(house, "2026-11-27T09:00:00-08:00");
  await house.run("Alice", { name: "rent paid" });

  house.setTime("2026-11-28T09:00:00-08:00");
  const outbound = await house.tick({ members: membersNamed("Alice") });

  expect(outbound.filter((m) => "memberId" in m)).toEqual([]);
  expect(postsIn(outbound, "chores")).toEqual([
    "Everyone has paid their Rent for December 2026.",
  ]);
});

test("a member with both floor roles is not reminded", async () => {
  const house = await houseWithRent();
  const [alice, chloe] = membersNamed("Alice", "Chloe");
  if (!alice || !chloe) throw new Error("The roster fixture has changed");

  const reminders = await rentRemindersAt(house, "2026-11-27T09:00:00-08:00", [
    { ...alice, roleNames: ["Floor 1", "Floor 3"] },
    chloe,
  ]);

  expect(reminders.map((m) => m.memberId)).toEqual(["3001"]);
});

test("after downtime, each unpaid Housemate gets at most one reminder per day", async () => {
  const house = await houseWithRent();
  await rentRemindersAt(house, "2026-11-27T09:00:00-08:00");

  expect(
    (await rentRemindersAt(house, "2026-12-03T14:00:00-08:00")).map(
      (m) => m.content,
    ),
  ).toEqual([
    "Reminder: your Rent for December 2026, $1,250.00, was due December 1 and is overdue. Use /rent paid once you have paid it.",
    "Reminder: your Rent for December 2026, $900.00, was due December 1 and is overdue. Use /rent paid once you have paid it.",
  ]);
  expect(await rentRemindersAt(house, "2026-12-03T15:00:00-08:00")).toEqual([]);
  // Off from before 09:00 on December 4 until the next morning: the 4th's reminder is not sent late.
  expect(await rentRemindersAt(house, "2026-12-05T08:30:00-08:00")).toEqual([]);
  expect(
    await rentRemindersAt(house, "2026-12-05T09:00:00-08:00"),
  ).toHaveLength(2);
});

test("when the bot first starts mid-period, Rent is not tracked until the next period starts", async () => {
  const house = await houseWithRent("2026-11-28T10:00:00-08:00");

  expect(await rentRemindersAt(house, "2026-12-02T09:00:00-08:00")).toEqual([]);
  expect(
    await rentRemindersAt(house, "2026-12-28T09:00:00-08:00"),
  ).toHaveLength(2);
});

test("/rent list shows who has paid for the current period, and who is overdue after the Due Date", async () => {
  const house = await houseWithRent();
  house.setTime("2026-11-27T09:00:00-08:00");
  await house.tick();
  await house.run("Chloe", { name: "rent paid" });

  const before = await house.run("Ben", { name: "rent list" });
  house.setTime("2026-12-02T09:00:00-08:00");
  const after = await house.run("Ben", { name: "rent list" });

  expect(before.reply.content).toBe(
    [
      "**Rent for December 2026**, due December 1",
      "- <@1001> (Floor 1): $1,250.00, **not paid**",
      "- <@1002> (Floor 1): **no Rent set**",
      "- <@3001> (Floor 3): $900.00, paid",
      "- <@3002> (Floor 3): **no Rent set**",
      "- <@3003> (Floor 3): **no Rent set**",
      "- <@3004> (Floor 3): **no Rent set**",
    ].join("\n"),
  );
  expect(after.reply.content).toContain(
    "- <@1001> (Floor 1): $1,250.00, **overdue**",
  );
});
