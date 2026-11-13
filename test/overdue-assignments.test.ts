import { describe, expect, test } from "vitest";
import type { Member, Outbound, Scope } from "../src/house/index.ts";
import {
  createTestHouse,
  membersNamed,
  postsIn,
  type MemberName,
  type TestHouse,
} from "./harness.ts";

/**
 * A House on December 1st after the monthly run, where Alice has Bathroom and Kitchen
 * and Chloe has Hallway and Stairs: Chloe's two Floor 3 Chores leave the Global one to Alice.
 */
async function houseInDecember(seed = 1): Promise<TestHouse> {
  const house = createTestHouse({ now: "2026-11-30T03:00:00-08:00", seed });
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
  house.setTime("2026-12-01T00:05:00-08:00");
  await house.tick({ members: membersNamed("Alice", "Chloe") });
  house.setTime("2026-12-01T10:00:00-08:00");
  return house;
}

async function complete(
  house: TestHouse,
  as: MemberName,
  choreName: string,
): Promise<void> {
  const done = await house.run(as, { name: "chore done", choreName });
  expect(done.reply.content).toBe(`Completed ${choreName}.`);
}

/** The post in #chores that hands out the month's Chores. */
function assignmentPost(outbound: Outbound[]): string | undefined {
  return postsIn(outbound, "chores").find((c) => c.startsWith("**Chores for"));
}

function dmTo(outbound: Outbound[], memberId: string): string | undefined {
  return outbound.find((m) => "memberId" in m && m.memberId === memberId)
    ?.content;
}

test("an Overdue Assignment stays with its Housemate and stands in for its Chore", async () => {
  const house = await houseInDecember();
  await complete(house, "Alice", "Bathroom");
  await complete(house, "Chloe", "Hallway");
  await complete(house, "Chloe", "Stairs");

  house.setTime("2027-01-01T00:05:00-08:00");
  const january = await house.tick({
    members: membersNamed("Alice", "Ben", "Chloe"),
  });

  // Kitchen is not handed out again, so Ben takes Bathroom and Chloe keeps the Floor 3 Chores.
  expect(assignmentPost(january)).toBe(
    [
      "**Chores for January 2027**",
      "",
      "<@1001>",
      "- Kitchen (Global, overdue from December 2026)",
      "",
      "<@1002>",
      "- Bathroom (Floor 1)",
      "",
      "<@3001>",
      "- Hallway (Floor 3)",
      "- Stairs (Floor 3)",
    ].join("\n"),
  );
  expect(dmTo(january, "1001")).toBe(
    [
      "Your Chores for January 2027:",
      "- Kitchen (Global, overdue from December 2026)",
    ].join("\n"),
  );
  expect((await house.run("Alice", { name: "chore mine" })).reply.content).toBe(
    [
      "Your open Assignments:",
      "- Kitchen (Global, overdue from December 2026)",
    ].join("\n"),
  );
  await complete(house, "Alice", "Kitchen");
});

/**
 * Leaves Alice's Kitchen open in December, completes everything else, and runs January with Ben added,
 * where Ben takes Bathroom from Alice and Chloe keeps the Floor 3 Chores.
 */
async function houseInJanuaryWithKitchenOverdue(): Promise<TestHouse> {
  const house = await houseInDecember();
  await complete(house, "Alice", "Bathroom");
  await complete(house, "Chloe", "Hallway");
  await complete(house, "Chloe", "Stairs");
  house.setTime("2027-01-01T00:05:00-08:00");
  await house.tick({ members: membersNamed("Alice", "Ben", "Chloe") });
  await complete(house, "Chloe", "Hallway");
  await complete(house, "Chloe", "Stairs");
  await complete(house, "Ben", "Bathroom");
  return house;
}

test("an Overdue Assignment stays overdue month after month until it is completed", async () => {
  const house = await houseInJanuaryWithKitchenOverdue();

  house.setTime("2027-02-01T00:05:00-08:00");
  const february = await house.tick({
    members: membersNamed("Alice", "Ben", "Chloe"),
  });

  // Bathroom leaves Ben, who had it in January.
  expect(dmTo(february, "1001")).toBe(
    [
      "Your Chores for February 2027:",
      "- Kitchen (Global, overdue from December 2026)",
      "- Bathroom (Floor 1)",
    ].join("\n"),
  );
  expect(assignmentPost(february)).not.toContain("- Kitchen (Global)");
});

test("once completed, a Chore that was overdue avoids the Housemate who held it", async () => {
  const house = await houseInJanuaryWithKitchenOverdue();
  house.setTime("2027-02-01T00:05:00-08:00");
  await house.tick({ members: membersNamed("Alice", "Ben", "Chloe") });
  await complete(house, "Alice", "Kitchen");
  await complete(house, "Alice", "Bathroom");

  house.setTime("2027-03-01T00:05:00-08:00");
  const march = await house.tick({
    members: membersNamed("Alice", "Ben", "Chloe"),
  });

  // Alice held both Bathroom and Kitchen last, so she gets neither.
  expect(assignmentPost(march)).toContain("- Kitchen (Global)");
  expect(dmTo(march, "1001")).toBeUndefined();
});

/** Alice as she would appear with the given roles. */
function aliceWithRoles(...roleNames: string[]): Member {
  const [alice] = membersNamed("Alice");
  if (!alice) throw new Error("No Alice in the roster fixture");
  return { ...alice, roleNames };
}

test.each([
  { left: "left the server", alice: [] },
  { left: "had her floor role removed", alice: [aliceWithRoles("Gamer")] },
])(
  "an Overdue Assignment whose Housemate has $left is dropped, and its Chore is handed out again",
  async ({ alice }) => {
    const house = await houseInDecember();
    await complete(house, "Chloe", "Hallway");
    await complete(house, "Chloe", "Stairs");

    house.setTime("2027-01-01T00:05:00-08:00");
    const january = await house.tick({
      members: [...alice, ...membersNamed("Ben", "Chloe")],
    });

    expect(dmTo(january, "1002")).toBe(
      [
        "Your Chores for January 2027:",
        "- Bathroom (Floor 1)",
        "- Kitchen (Global)",
      ].join("\n"),
    );
    expect(assignmentPost(january)).not.toContain("<@1001>");
    expect(
      (await house.run("Alice", { name: "chore mine" })).reply.content,
    ).toBe("You have no open Assignments.");
  },
);

test("a member with both floor roles keeps their Overdue Assignments, which are still posted and DMed", async () => {
  const house = await houseInDecember();
  await complete(house, "Alice", "Bathroom");
  await complete(house, "Chloe", "Hallway");
  await complete(house, "Chloe", "Stairs");

  house.setTime("2027-01-01T00:05:00-08:00");
  const january = await house.tick({
    members: [
      aliceWithRoles("Floor 1", "Floor 3"),
      ...membersNamed("Ben", "Chloe"),
    ],
  });

  // Members who are not Housemates come after those who are.
  expect(assignmentPost(january)).toBe(
    [
      "**Chores for January 2027**",
      "",
      "<@1002>",
      "- Bathroom (Floor 1)",
      "",
      "<@3001>",
      "- Hallway (Floor 3)",
      "- Stairs (Floor 3)",
      "",
      "<@1001>",
      "- Kitchen (Global, overdue from December 2026)",
    ].join("\n"),
  );
  expect(dmTo(january, "1001")).toBe(
    [
      "Your Chores for January 2027:",
      "- Kitchen (Global, overdue from December 2026)",
    ].join("\n"),
  );
  expect(
    postsIn(january, "admin").filter((post) => post.includes("has both")),
  ).toEqual([
    "<@1001> has both the Floor 1 and Floor 3 roles, so they were given no new Chores for January 2027. " +
      "Remove one of the roles to include them from next month.",
  ]);
});

test("an Overdue Assignment whose Chore is retired is dropped", async () => {
  const house = await houseInDecember();
  await complete(house, "Alice", "Bathroom");
  await house.run("Alice", { name: "chore retire", choreName: "Kitchen" });

  house.setTime("2027-01-01T00:05:00-08:00");
  const january = await house.tick({
    members: membersNamed("Alice", "Ben", "Chloe"),
  });

  expect(assignmentPost(january)).not.toContain("Kitchen");
  expect((await house.run("Alice", { name: "chore mine" })).reply.content).toBe(
    "You have no open Assignments.",
  );
  expect(
    (await house.run("Alice", { name: "chore done", choreName: "Kitchen" }))
      .reply.content,
  ).toBe("You have no open Assignment named Kitchen.");
});

describe("Overdue Assignments do not count toward balancing", () => {
  test.each(Array.from({ length: 10 }, (_, i) => i + 1))(
    "a Housemate with two still gets an even share of the new Chores (seed %i)",
    async (seed) => {
      const house = await houseInDecember(seed);
      for (const choreName of ["Lounge", "Garden"]) {
        await house.run("Alice", {
          name: "chore add",
          choreName,
          scope: "global",
        });
      }

      house.setTime("2027-01-01T00:05:00-08:00");
      const january = await house.tick({
        members: membersNamed("Alice", "Ben"),
      });

      const alice = dmTo(january, "1001")?.split("\n") ?? [];
      expect(alice.slice(1, 3)).toEqual([
        "- Bathroom (Floor 1, overdue from December 2026)",
        "- Kitchen (Global, overdue from December 2026)",
      ]);
      expect(alice).toHaveLength(4);
      expect(dmTo(january, "1002")?.split("\n")).toHaveLength(2);
    },
  );
});

test("the monthly run first posts a summary of the month just ended, per Housemate", async () => {
  const house = await houseInDecember();
  await complete(house, "Alice", "Bathroom");
  await complete(house, "Chloe", "Hallway");

  house.setTime("2027-01-01T00:05:00-08:00");
  const january = await house.tick({ members: membersNamed("Alice", "Ben") });

  // Chloe has left, so her open Stairs is dropped.
  expect(postsIn(january, "chores")).toEqual([
    [
      "**Summary of December 2026**",
      "",
      "<@1001>",
      "Completed:",
      "- Bathroom (Floor 1)",
      "Overdue:",
      "- Kitchen (Global)",
      "",
      "<@3001>",
      "Completed:",
      "- Hallway (Floor 3)",
      "",
      "Dropped, because the Housemate has left or the Chore is retired:",
      "- Stairs (Floor 3) from <@3001>",
    ].join("\n"),
    assignmentPost(january),
  ]);
  // The summary comes before every other message, DMs included.
  expect(january[0]).toEqual({
    channel: "chores",
    content: expect.stringMatching(
      /^\*\*Summary of December 2026\*\*/,
    ) as string,
  });

  house.setTime("2027-01-01T00:06:00-08:00");
  expect(await house.tick({ members: membersNamed("Alice", "Ben") })).toEqual(
    [],
  );
});

test("the summary marks Assignments that were already overdue during the month", async () => {
  const house = await houseInJanuaryWithKitchenOverdue();

  house.setTime("2027-02-01T00:05:00-08:00");
  const february = await house.tick({
    members: membersNamed("Alice", "Ben", "Chloe"),
  });

  expect(postsIn(february, "chores")[0]).toBe(
    [
      "**Summary of January 2027**",
      "",
      "<@1001>",
      "Overdue:",
      "- Kitchen (Global, overdue from December 2026)",
      "",
      "<@1002>",
      "Completed:",
      "- Bathroom (Floor 1)",
      "",
      "<@3001>",
      "Completed:",
      "- Hallway (Floor 3)",
      "- Stairs (Floor 3)",
    ].join("\n"),
  );
});
