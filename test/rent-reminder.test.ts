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
      "memberId" in m && m.content.startsWith("**Rent Reminder**"),
  );
}

/** A Rent Reminder DM as Housemates read it. */
function reminder(month: string, amount: string, due: string): string {
  return [
    "**Rent Reminder**",
    `Your Rent for **${month}** is **${amount}**.`,
    `Due: *${due}*`,
    "",
    "Use `/rent paid` once you have paid it.",
  ].join("\n");
}

test("from 09:00 three days before the end of the month until its Due Date, each unpaid Housemate is DMed that month's Rent daily, and nothing after", async () => {
  const house = await houseWithRent();

  expect(await rentRemindersAt(house, "2026-11-26T09:00:00-08:00")).toEqual([]);
  expect(await rentRemindersAt(house, "2026-11-27T08:59:00-08:00")).toEqual([]);
  expect(await rentRemindersAt(house, "2026-11-27T09:00:00-08:00")).toEqual([
    {
      memberId: "1001",
      content: reminder("November 2026", "$1,250.00", "November 30"),
      ifUndelivered: {
        channel: "admin",
        content:
          "Could not DM <@1001> their Rent Reminder: $1,250.00 for November 2026, due November 30.",
      },
    },
    {
      memberId: "3001",
      content: reminder("November 2026", "$900.00", "November 30"),
      ifUndelivered: {
        channel: "admin",
        content:
          "Could not DM <@3001> their Rent Reminder: $900.00 for November 2026, due November 30.",
      },
    },
  ]);
  expect(await rentRemindersAt(house, "2026-11-27T15:00:00-08:00")).toEqual([]);
  expect(
    (await rentRemindersAt(house, "2026-11-30T09:00:00-08:00")).map(
      (m) => m.content,
    ),
  ).toEqual([
    reminder("November 2026", "$1,250.00", "November 30"),
    reminder("November 2026", "$900.00", "November 30"),
  ]);
  for (const day of ["2026-12-01", "2026-12-03", "2026-12-27"]) {
    expect(await rentRemindersAt(house, `${day}T09:00:00-08:00`)).toEqual([]);
  }
});

test.each([
  {
    length: "28-day",
    month: "2027-02",
    start: "2027-02-25",
    name: "February 2027",
    due: "February 28",
  },
  {
    length: "29-day",
    month: "2028-02",
    start: "2028-02-26",
    name: "February 2028",
    due: "February 29",
  },
  {
    length: "30-day",
    month: "2027-04",
    start: "2027-04-27",
    name: "April 2027",
    due: "April 30",
  },
  {
    length: "31-day",
    month: "2026-12",
    start: "2026-12-28",
    name: "December 2026",
    due: "December 31",
  },
])(
  "in $month, a $length month, Rent Reminders start on $start at 09:00 house time and name its last day",
  async ({ month, start, name, due }) => {
    const house = await houseWithRent(`${month}-10T10:00:00-08:00`);
    // Daylight saving time is in effect in April.
    const offset = month.endsWith("-04") ? "-07:00" : "-08:00";

    expect(await rentRemindersAt(house, `${start}T08:59:00${offset}`)).toEqual(
      [],
    );
    expect(
      (await rentRemindersAt(house, `${start}T09:00:00${offset}`)).map(
        (m) => m.content,
      ),
    ).toEqual([
      reminder(name, "$1,250.00", due),
      reminder(name, "$900.00", due),
    ]);
  },
);

test("a Housemate who marks their Rent paid gets no more reminders that month, and is reminded again the next", async () => {
  const house = await houseWithRent();
  await rentRemindersAt(house, "2026-11-27T09:00:00-08:00");
  house.setTime("2026-11-28T12:00:00-08:00");

  const paid = await house.run("Chloe", { name: "rent paid" });

  expect(paid.reply).toEqual({
    content: "Marked your Rent for November 2026 paid.",
    private: true,
  });
  for (const day of ["2026-11-29", "2026-11-30"]) {
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
    ["1001", reminder("December 2026", "$1,250.00", "December 31")],
    ["3001", reminder("December 2026", "$900.00", "December 31")],
  ]);
});

test("a Housemate can mark their Rent paid any time in the month, and it counts for that month only", async () => {
  const house = await houseWithRent();

  const early = await house.run("Chloe", { name: "rent paid" });
  const november = await rentRemindersAt(house, "2026-11-27T09:00:00-08:00");
  house.setTime("2026-12-01T00:00:00-08:00");
  const december = await house.run("Chloe", { name: "rent paid" });

  expect(early.reply.content).toBe("Marked your Rent for November 2026 paid.");
  expect(november.map((m) => m.memberId)).toEqual(["1001"]);
  expect(december.reply.content).toBe(
    "Marked your Rent for December 2026 paid.",
  );
});

test("marking Rent paid again in the same month is refused, naming when the next month's can be marked", async () => {
  const house = await houseWithRent();
  await house.run("Chloe", { name: "rent paid" });
  house.setTime("2026-11-30T23:59:00-08:00");

  const again = await house.run("Chloe", { name: "rent paid" });

  expect(again).toEqual({
    reply: {
      content:
        "You have already paid your Rent for November 2026. You can mark your Rent for December 2026 paid from December 1.",
      private: true,
    },
    outbound: [],
  });
});

test("a Housemate without Rent set cannot mark it paid", async () => {
  const house = await houseWithRent();

  const paid = await house.run("Ben", { name: "rent paid" });

  expect(paid).toEqual({
    reply: {
      content: "You have no Rent set. Ask an Admin to set it with /rent set.",
      private: true,
    },
    outbound: [],
  });
});

test("each payment is posted in #rent, and once everyone with Rent has paid, #rent is told once", async () => {
  const house = await houseWithRent();

  const alice = await house.run("Alice", { name: "rent paid" });
  const chloe = await house.run("Chloe", { name: "rent paid" });
  const again = await house.run("Chloe", { name: "rent paid" });
  house.setTime("2026-11-28T09:00:00-08:00");
  const nextDay = await house.tick();

  expect(alice.outbound).toEqual([
    {
      channel: "rent",
      content: "<@1001> has paid their Rent for November 2026.",
    },
  ]);
  expect(chloe.outbound).toEqual([
    {
      channel: "rent",
      content: "<@3001> has paid their Rent for November 2026.",
    },
    {
      channel: "rent",
      content: "Everyone has paid their Rent for November 2026.",
    },
  ]);
  expect(again.outbound).toEqual([]);
  expect(postsIn(nextDay, "rent")).toEqual([]);
  expect(postsIn([...alice.outbound, ...chloe.outbound], "chores")).toEqual([]);
});

test("a Housemate who leaves gets no more reminders, and is not waited on for the all-paid message", async () => {
  const house = await houseWithRent();
  await rentRemindersAt(house, "2026-11-27T09:00:00-08:00");
  await house.run("Alice", { name: "rent paid" });

  house.setTime("2026-11-28T09:00:00-08:00");
  const outbound = await house.tick({ members: membersNamed("Alice") });

  expect(outbound.filter((m) => "memberId" in m)).toEqual([]);
  expect(postsIn(outbound, "rent")).toEqual([
    "Everyone has paid their Rent for November 2026.",
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
    (await rentRemindersAt(house, "2026-11-28T14:00:00-08:00")).map(
      (m) => m.content,
    ),
  ).toEqual([
    reminder("November 2026", "$1,250.00", "November 30"),
    reminder("November 2026", "$900.00", "November 30"),
  ]);
  expect(await rentRemindersAt(house, "2026-11-28T15:00:00-08:00")).toEqual([]);
  // Off from before 09:00 on November 29 until the next morning: the 29th's reminder is not sent late.
  expect(await rentRemindersAt(house, "2026-11-30T08:30:00-08:00")).toEqual([]);
  expect(
    await rentRemindersAt(house, "2026-11-30T09:00:00-08:00"),
  ).toHaveLength(2);
});

test("when the bot first starts during the reminder days, it reminds of that month's Rent from the next morning", async () => {
  const house = await houseWithRent("2026-11-28T10:00:00-08:00");

  expect(
    await rentRemindersAt(house, "2026-11-29T09:00:00-08:00"),
  ).toHaveLength(2);
});

test("/rent list shows who has paid for the current month, and each month starts with nobody paid", async () => {
  const house = await houseWithRent();
  await house.run("Chloe", { name: "rent paid" });

  const november = await house.run("Ben", { name: "rent list" });
  house.setTime("2026-12-02T09:00:00-08:00");
  const december = await house.run("Ben", { name: "rent list" });

  expect(november.reply.content).toBe(
    [
      "**Rent for November 2026**, due November 30",
      "- <@1001> (Floor 1): $1,250.00, **not paid**",
      "- <@1002> (Floor 1): **no Rent set**",
      "- <@3001> (Floor 3): $900.00, paid",
      "- <@3002> (Floor 3): **no Rent set**",
      "- <@3003> (Floor 3): **no Rent set**",
      "- <@3004> (Floor 3): **no Rent set**",
    ].join("\n"),
  );
  expect(december.reply.content).toContain(
    "**Rent for December 2026**, due December 31",
  );
  expect(december.reply.content).toContain(
    "- <@3001> (Floor 3): $900.00, **not paid**",
  );
});

test("the all-paid message waits on a member with both floor roles who has not paid", async () => {
  const house = await houseWithRent();
  const [alice, chloe] = membersNamed("Alice", "Chloe");
  if (!alice || !chloe) throw new Error("The roster fixture has changed");
  await rentRemindersAt(house, "2026-11-27T09:00:00-08:00");
  await house.run("Alice", { name: "rent paid" });

  house.setTime("2026-11-28T09:00:00-08:00");
  const outbound = await house.tick({
    members: [alice, { ...chloe, roleNames: ["Floor 1", "Floor 3"] }],
  });

  expect(postsIn(outbound, "rent")).toEqual([]);
});
