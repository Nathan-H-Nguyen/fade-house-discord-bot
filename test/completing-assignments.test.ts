import { expect, test } from "vitest";
import type { Scope } from "../src/house/index.ts";
import { createTestHouse, membersNamed, type TestHouse } from "./harness.ts";

/**
 * A House on December 1st after the monthly run, where Alice has Bathroom and Kitchen
 * and Chloe has Hallway and Stairs: Chloe's two Floor 3 Chores leave the Global one to Alice.
 */
async function houseInDecember(): Promise<TestHouse> {
  const house = createTestHouse({ now: "2026-11-30T03:00:00-08:00" });
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

test("a Housemate completes their own Assignment and #chores is told", async () => {
  const house = await houseInDecember();

  const done = await house.run("Alice", {
    name: "chore done",
    choreName: "Kitchen",
  });

  expect(done).toEqual({
    reply: { content: "Completed Kitchen.", private: true },
    outbound: [{ channel: "chores", content: "<@1001> completed Kitchen." }],
  });
});

test("completing someone else's Assignment is refused, and nothing is posted", async () => {
  const house = await houseInDecember();

  const done = await house.run("Alice", {
    name: "chore done",
    choreName: "hallway",
  });

  expect(done).toEqual({
    reply: {
      content: "Hallway is <@3001>'s Assignment, not yours.",
      private: true,
    },
    outbound: [],
  });
  expect(
    (await house.run("Chloe", { name: "chore done", choreName: "Hallway" }))
      .reply.content,
  ).toBe("Completed Hallway.");
});

test("completing an Assignment already complete is refused, and nothing is posted", async () => {
  const house = await houseInDecember();
  await house.run("Alice", { name: "chore done", choreName: "Kitchen" });

  const again = await house.run("Alice", {
    name: "chore done",
    choreName: " KITCHEN ",
  });

  expect(again).toEqual({
    reply: { content: "You have already completed Kitchen.", private: true },
    outbound: [],
  });
});

test("completing a Chore no one holds an open Assignment for is refused", async () => {
  const house = await houseInDecember();
  await house.run("Alice", {
    name: "chore add",
    choreName: "Garden",
    scope: "global",
  });

  const garden = await house.run("Alice", {
    name: "chore done",
    choreName: "Garden",
  });
  const unknown = await house.run("Alice", {
    name: "chore done",
    choreName: "*Bins*",
  });

  expect(garden).toEqual({
    reply: {
      content: "You have no open Assignment named Garden.",
      private: true,
    },
    outbound: [],
  });
  expect(unknown.reply.content).toBe(
    "You have no open Assignment named \\*Bins\\*.",
  );
});

test("in a new month a Chore's name means that month's Assignment, not the one completed before", async () => {
  const house = await houseInDecember();
  await house.run("Chloe", { name: "chore done", choreName: "Hallway" });
  house.setTime("2027-01-01T00:05:00-08:00");
  await house.tick({ members: membersNamed("Alice", "Ben", "Chloe", "Dan") });

  const done = await house.run("Chloe", {
    name: "chore done",
    choreName: "Hallway",
  });

  // Hallway goes to Dan in January, since Chloe had it in December.
  expect(done.reply.content).toBe(
    "Hallway is <@3002>'s Assignment, not yours.",
  );
});

test("a Housemate privately lists their own open Assignments", async () => {
  const house = await houseInDecember();

  const before = await house.run("Alice", { name: "chore mine" });
  await house.run("Alice", { name: "chore done", choreName: "Bathroom" });
  const after = await house.run("Alice", { name: "chore mine" });

  expect(before).toEqual({
    reply: {
      content: [
        "Your open Assignments:",
        "- Bathroom (Floor 1)",
        "- Kitchen (Global)",
      ].join("\n"),
      private: true,
    },
    outbound: [],
  });
  expect(after.reply.content).toBe(
    ["Your open Assignments:", "- Kitchen (Global)"].join("\n"),
  );
});

test("a Housemate with no open Assignments is told so", async () => {
  const house = await houseInDecember();

  const mine = await house.run("Ben", { name: "chore mine" });

  expect(mine.reply).toEqual({
    content: "You have no open Assignments.",
    private: true,
  });
});

test("an Assignment keeps the Chore's name and Scope as they were when it was given", async () => {
  const house = await houseInDecember();
  await house.run("Alice", {
    name: "chore edit",
    choreName: "Kitchen",
    newName: "Galley",
    scope: "floor-3",
  });

  const mine = await house.run("Alice", { name: "chore mine" });
  const done = await house.run("Alice", {
    name: "chore done",
    choreName: "Kitchen",
  });

  expect(mine.reply.content).toContain("- Kitchen (Global)");
  expect(done.reply.content).toBe("Completed Kitchen.");
});

test("Assignment autocomplete suggests only the caller's open Assignments containing the typed text", async () => {
  const house = await houseInDecember();
  await house.run("Alice", { name: "chore done", choreName: "Bathroom" });

  expect(house.suggest("Alice", { name: "assignment", text: "" })).toEqual([
    { label: "Kitchen (Global)", value: "Kitchen" },
  ]);
  expect(house.suggest("Chloe", { name: "assignment", text: "ALL" })).toEqual([
    { label: "Hallway (Floor 3)", value: "Hallway" },
  ]);
  expect(house.suggest("Ben", { name: "assignment", text: "" })).toEqual([]);
  expect(house.suggest("Guest", { name: "assignment", text: "" })).toEqual([]);
});
