import { describe, expect, test } from "vitest";
import type { Member, Outbound, Scope } from "../src/house/index.ts";
import { createTestHouse, roster, temporaryPath } from "./harness.ts";

type TestHouse = ReturnType<typeof createTestHouse>;

/** Seeds to try where the outcome depends on how ties fall. */
const seeds = Array.from({ length: 20 }, (_, i) => i + 1);

function membersNamed(...names: string[]): Member[] {
  return roster.filter((m) => names.includes(m.displayName));
}

const displayNames = new Map<string, string>(
  roster.map((m) => [m.id, m.displayName]),
);

/**
 * A House on November 30th, with that day's backup already taken,
 * so the next tick at 00:05 on December 1st runs only the monthly assignment.
 */
async function houseOnNovember30(
  options: Parameters<typeof createTestHouse>[0] = {},
): Promise<TestHouse> {
  const house = createTestHouse({
    now: "2026-11-30T03:00:00-08:00",
    ...options,
  });
  await house.tick();
  return house;
}

async function addChores(
  house: TestHouse,
  chores: Record<string, Scope>,
): Promise<void> {
  for (const [choreName, scope] of Object.entries(chores)) {
    await house.run("Alice", { name: "chore add", choreName, scope });
  }
}

/** Each Housemate's Chores, by display name, as read from the DMs they were sent. */
function dmedChores(outbound: Outbound[]): Map<string, string[]> {
  return new Map(
    outbound.flatMap((message) =>
      "memberId" in message
        ? [
            [
              displayNames.get(message.memberId) ?? message.memberId,
              message.content
                .split("\n")
                .slice(1)
                .map((line) => line.replace(/^- (.*) \([^)]*\)$/, "$1")),
            ],
          ]
        : [],
    ),
  );
}

/** Who each Chore was given to, by Chore name. */
function assignees(outbound: Outbound[]): Map<string, string> {
  return new Map(
    [...dmedChores(outbound)].flatMap(([housemate, chores]) =>
      chores.map((chore) => [chore, housemate] as const),
    ),
  );
}

function counts(outbound: Outbound[]): Record<string, number> {
  return Object.fromEntries(
    [...dmedChores(outbound)].map(([housemate, chores]) => [
      housemate,
      chores.length,
    ]),
  );
}

function postsIn(outbound: Outbound[], channel: "chores" | "admin"): string[] {
  return outbound.flatMap((message) =>
    "channel" in message && message.channel === channel
      ? [message.content]
      : [],
  );
}

test("at 00:05 on the 1st every active Chore is posted in #chores by Housemate, and each Housemate is DMed their own", async () => {
  const house = await houseOnNovember30();
  await addChores(house, {
    Bathroom: "floor-1",
    Hallway: "floor-3",
    Stairs: "floor-3",
    Kitchen: "global",
  });
  const members = membersNamed("Alice", "Chloe", "Guest", "SomeBot");

  house.setTime("2026-12-01T00:04:00-08:00");
  expect(await house.tick({ members })).toEqual([]);
  house.setTime("2026-12-01T00:05:00-08:00");
  const outbound = await house.tick({ members });

  // Chloe has two Floor 3 Chores, so balancing gives the Global one to Alice.
  expect(outbound).toEqual([
    {
      channel: "chores",
      content: [
        "**Chores for December 2026**",
        "",
        "<@1001>",
        "- Bathroom (Floor 1)",
        "- Kitchen (Global)",
        "",
        "<@3001>",
        "- Hallway (Floor 3)",
        "- Stairs (Floor 3)",
      ].join("\n"),
    },
    {
      memberId: "1001",
      content: [
        "Your Chores for December 2026:",
        "- Bathroom (Floor 1)",
        "- Kitchen (Global)",
      ].join("\n"),
      ifUndelivered: {
        channel: "chores",
        content:
          "Could not DM <@1001> their Chores for December 2026. They are in the post above.",
      },
    },
    {
      memberId: "3001",
      content: [
        "Your Chores for December 2026:",
        "- Hallway (Floor 3)",
        "- Stairs (Floor 3)",
      ].join("\n"),
      ifUndelivered: {
        channel: "chores",
        content:
          "Could not DM <@3001> their Chores for December 2026. They are in the post above.",
      },
    },
  ]);
});

test("a member with both floor roles gets no Chores and is reported in #bot-admin", async () => {
  const house = await houseOnNovember30();
  await addChores(house, { Kitchen: "global", Bathroom: "floor-1" });

  house.setTime("2026-12-01T00:05:00-08:00");
  const outbound = await house.tick();

  expect(postsIn(outbound, "admin")).toEqual([
    "<@9002> has both the Floor 1 and Floor 3 roles, so they were given no Chores for December 2026. " +
      "Remove one of the roles to include them from next month.",
  ]);
  expect(postsIn(outbound, "chores")[0]).not.toContain("<@9002>");
});

describe("balancing counts every Assignment across Scopes, so the smaller Floor takes fewer Global Chores", () => {
  test.each(seeds)(
    "with Floors of 2 and 4 and many Floor 1 Chores (seed %i)",
    async (seed) => {
      const house = await houseOnNovember30({ seed });
      await addChores(house, {
        "Bathroom 1": "floor-1",
        "Hallway 1": "floor-1",
        "Landing 1": "floor-1",
        "Fridge 1": "floor-1",
        "Bathroom 3": "floor-3",
        "Hallway 3": "floor-3",
        "Landing 3": "floor-3",
        "Fridge 3": "floor-3",
        Kitchen: "global",
        Lounge: "global",
        Bins: "global",
        Recycling: "global",
      });

      house.setTime("2026-12-01T00:05:00-08:00");
      const outbound = await house.tick();

      expect(counts(outbound)).toEqual({
        Alice: 2,
        Ben: 2,
        Chloe: 2,
        Dan: 2,
        Eve: 2,
        Finn: 2,
      });
      const given = assignees(outbound);
      for (const [chore, housemate] of given) {
        if (chore.endsWith(" 1")) expect(["Alice", "Ben"]).toContain(housemate);
        if (chore.endsWith(" 3")) {
          expect(["Chloe", "Dan", "Eve", "Finn"]).toContain(housemate);
        }
      }
      // Floor 1's four Chores fill its two Housemates, so every Global Chore goes to Floor 3.
      for (const chore of ["Kitchen", "Lounge", "Bins", "Recycling"]) {
        expect(["Chloe", "Dan", "Eve", "Finn"]).toContain(given.get(chore));
      }
    },
  );

  test.each(seeds)(
    "with Floors of 2 and 4 and few Floor Chores (seed %i)",
    async (seed) => {
      const house = await houseOnNovember30({ seed });
      await addChores(house, {
        Bathroom: "floor-1",
        Hallway: "floor-3",
        Kitchen: "global",
        Lounge: "global",
        Bins: "global",
        Recycling: "global",
        Garden: "global",
        Windows: "global",
        Fridge: "global",
        Mopping: "global",
        Dusting: "global",
        Laundry: "global",
      });

      house.setTime("2026-12-01T00:05:00-08:00");
      const outbound = await house.tick();

      expect(counts(outbound)).toEqual({
        Alice: 2,
        Ben: 2,
        Chloe: 2,
        Dan: 2,
        Eve: 2,
        Finn: 2,
      });
    },
  );
});

test.each(seeds)(
  "over two months no Chore goes to the same Housemate twice running, and the split stays even (seed %i)",
  async (seed) => {
    const house = await houseOnNovember30({ seed });
    await addChores(house, {
      "Bathroom 1": "floor-1",
      "Hallway 1": "floor-1",
      "Bathroom 3": "floor-3",
      "Hallway 3": "floor-3",
      "Landing 3": "floor-3",
      "Fridge 3": "floor-3",
      Kitchen: "global",
      Lounge: "global",
      Bins: "global",
      Recycling: "global",
      Garden: "global",
      Windows: "global",
    });

    house.setTime("2026-12-01T00:05:00-08:00");
    const december = assignees(await house.tick());
    house.setTime("2027-01-01T00:05:00-08:00");
    const januaryOutbound = await house.tick();
    const january = assignees(januaryOutbound);

    expect(postsIn(januaryOutbound, "chores")[0]).toMatch(
      /^\*\*Chores for January 2027\*\*\n/,
    );
    expect(january.size).toBe(12);
    for (const [chore, housemate] of january) {
      expect(housemate, chore).not.toBe(december.get(chore));
    }
    expect(Object.values(counts(januaryOutbound))).toEqual([2, 2, 2, 2, 2, 2]);
  },
);

test("last month's assignee keeps a Chore when no one else is eligible", async () => {
  const house = await houseOnNovember30();
  await addChores(house, { Bathroom: "floor-1" });
  const members = membersNamed("Alice", "Chloe");

  house.setTime("2026-12-01T00:05:00-08:00");
  const december = assignees(await house.tick({ members }));
  house.setTime("2027-01-01T00:05:00-08:00");
  const january = assignees(await house.tick({ members }));

  expect(december.get("Bathroom")).toBe("Alice");
  expect(january.get("Bathroom")).toBe("Alice");
});

test("a Chore whose Scope has no Housemates is skipped and listed in the post", async () => {
  const house = await houseOnNovember30();
  await addChores(house, { Bathroom: "floor-1", Kitchen: "global" });
  const members = membersNamed("Chloe", "Guest");

  house.setTime("2026-12-01T00:05:00-08:00");
  const outbound = await house.tick({ members });

  expect(postsIn(outbound, "chores")).toEqual([
    [
      "**Chores for December 2026**",
      "",
      "<@3001>",
      "- Kitchen (Global)",
      "",
      "Not assigned, because no Housemate is eligible:",
      "- Bathroom (Floor 1)",
    ].join("\n"),
  ]);
  expect(dmedChores(outbound)).toEqual(new Map([["Chloe", ["Kitchen"]]]));
});

test("with no active Chores the post says so and no one is DMed", async () => {
  const house = await houseOnNovember30();
  await addChores(house, { Kitchen: "global" });
  await house.run("Alice", { name: "chore retire", choreName: "Kitchen" });

  house.setTime("2026-12-01T00:05:00-08:00");
  const outbound = await house.tick({ members: membersNamed("Alice") });

  expect(outbound).toEqual([
    {
      channel: "chores",
      content: "**Chores for December 2026**\n\nThere are no active Chores.",
    },
  ]);
});

test("ticking again in the same month, even after a restart, does not reshuffle", async () => {
  const databasePath = temporaryPath("house.db");
  const before = await houseOnNovember30({ databasePath });
  await addChores(before, { Kitchen: "global", Bathroom: "floor-1" });
  before.setTime("2026-12-01T00:05:00-08:00");
  expect(postsIn(await before.tick(), "chores")).toHaveLength(1);
  before.setTime("2026-12-01T00:06:00-08:00");
  expect(await before.tick()).toEqual([]);
  await before.close();

  const after = createTestHouse({
    databasePath,
    now: "2026-12-01T02:00:00-08:00",
  });

  expect(await after.tick()).toEqual([]);
  after.setTime("2026-12-31T23:59:00-08:00");
  expect(postsIn(await after.tick(), "chores")).toEqual([]);
});

test("a monthly run missed while the bot was off runs once when it comes back", async () => {
  const house = await houseOnNovember30();
  await addChores(house, { Kitchen: "global" });

  house.setTime("2026-12-03T10:00:00-08:00");
  const caughtUp = await house.tick();
  house.setTime("2026-12-03T10:01:00-08:00");
  const again = await house.tick();

  expect(postsIn(caughtUp, "chores")).toEqual([
    expect.stringMatching(/^\*\*Chores for December 2026\*\*\n/) as string,
  ]);
  expect(dmedChores(caughtUp).size).toBe(1);
  expect(again).toEqual([]);
});

test("a new bot waits for the next 1st rather than handing out Chores mid-month", async () => {
  const house = createTestHouse({ now: "2026-11-12T10:00:00-08:00" });
  await addChores(house, { Kitchen: "global" });

  expect(await house.tick()).toEqual([]);
  house.setTime("2026-12-01T00:05:00-08:00");
  expect(postsIn(await house.tick(), "chores")).toEqual([
    expect.stringMatching(/^\*\*Chores for December 2026\*\*\n/) as string,
  ]);
});

test("retired Chores are not handed out", async () => {
  const house = await houseOnNovember30();
  await addChores(house, { Kitchen: "global", Lounge: "global" });
  await house.run("Alice", { name: "chore retire", choreName: "Lounge" });

  house.setTime("2026-12-01T00:05:00-08:00");
  const outbound = await house.tick({ members: membersNamed("Alice") });

  expect(dmedChores(outbound)).toEqual(new Map([["Alice", ["Kitchen"]]]));
});

test("/dev advance-to the 1st at 00:05 runs the monthly assignment with the caller's roster", async () => {
  const house = await houseOnNovember30({ isTestServer: true });
  await addChores(house, { Kitchen: "global" });

  const result = await house.run("Alice", {
    name: "dev advance-to",
    to: "2026-12-01 00:05",
  });

  expect(postsIn(result.outbound, "chores")).toEqual([
    expect.stringMatching(/^\*\*Chores for December 2026\*\*\n/) as string,
  ]);
  expect(dmedChores(result.outbound).size).toBe(1);
});
