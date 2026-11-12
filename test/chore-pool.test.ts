import { expect, test } from "vitest";
import { createTestHouse } from "./harness.ts";

test("a Housemate adds a Chore and sees it in the list under its Scope", () => {
  const house = createTestHouse();

  const added = house.run("Alice", {
    name: "chore add",
    choreName: "Kitchen",
    scope: "global",
  });

  expect(added.reply).toEqual({
    content: "Added Kitchen to the Global Chores.",
    private: true,
  });
  expect(house.run("Chloe", { name: "chore list" }).reply).toEqual({
    content: [
      "**Global**",
      "- Kitchen",
      "",
      "**Floor 1**",
      "None",
      "",
      "**Floor 3**",
      "None",
    ].join("\n"),
    private: true,
  });
});

test("a member without a floor role is privately refused and adds nothing", () => {
  const house = createTestHouse();

  const added = house.run("Guest", {
    name: "chore add",
    choreName: "Kitchen",
    scope: "global",
  });

  expect(added).toEqual({
    reply: {
      content:
        "Only Housemates can use this command. Ask an Admin to give you the Floor 1 or Floor 3 role.",
      private: true,
    },
    outbound: [],
  });
  expect(
    house.run("Alice", { name: "chore list" }).reply.content,
  ).not.toContain("Kitchen");
});

test("a member with two floor roles is privately refused and told to fix their roles", () => {
  const house = createTestHouse();

  const listed = house.run("Mixed", { name: "chore list" });

  expect(listed).toEqual({
    reply: {
      content:
        "You have both the Floor 1 and Floor 3 roles, so you are not counted as a Housemate. Ask an Admin to remove one.",
      private: true,
    },
    outbound: [],
  });
});

test("the list groups active Chores by Scope, alphabetically within each", () => {
  const house = createTestHouse();
  house.run("Alice", {
    name: "chore add",
    choreName: "Vacuum stairs",
    scope: "global",
  });
  house.run("Ben", {
    name: "chore add",
    choreName: "Floor 1 bathroom",
    scope: "floor-1",
  });
  house.run("Dan", {
    name: "chore add",
    choreName: "Floor 3 bathroom",
    scope: "floor-3",
  });
  house.run("Eve", { name: "chore add", choreName: "bins", scope: "global" });
  house.run("Finn", {
    name: "chore add",
    choreName: "Floor 3 kitchen",
    scope: "floor-3",
  });

  expect(house.run("Chloe", { name: "chore list" }).reply.content).toBe(
    [
      "**Global**",
      "- bins",
      "- Vacuum stairs",
      "",
      "**Floor 1**",
      "- Floor 1 bathroom",
      "",
      "**Floor 3**",
      "- Floor 3 bathroom",
      "- Floor 3 kitchen",
    ].join("\n"),
  );
});

test("a Chore name is trimmed, and a blank one is refused", () => {
  const house = createTestHouse();

  const blank = house.run("Alice", {
    name: "chore add",
    choreName: "   ",
    scope: "global",
  });
  const padded = house.run("Alice", {
    name: "chore add",
    choreName: "  Bins  ",
    scope: "global",
  });

  expect(blank.reply).toEqual({
    content: "A Chore needs a name.",
    private: true,
  });
  expect(padded.reply.content).toBe("Added Bins to the Global Chores.");
  expect(house.run("Alice", { name: "chore list" }).reply.content).toMatch(
    /^\*\*Global\*\*\n- Bins\n\n/,
  );
});

test("a Chore name longer than 100 characters is refused", () => {
  const house = createTestHouse();

  const added = house.run("Alice", {
    name: "chore add",
    choreName: "x".repeat(101),
    scope: "global",
  });

  expect(added.reply).toEqual({
    content: "A Chore name can be at most 100 characters.",
    private: true,
  });
  expect(house.run("Alice", { name: "chore list" }).reply.content).toMatch(
    /^\*\*Global\*\*\nNone\n/,
  );
});

test("Chore names show exactly as typed, even with markdown characters", () => {
  const house = createTestHouse();

  const added = house.run("Alice", {
    name: "chore add",
    choreName: "*Bins* & `recycling`",
    scope: "global",
  });

  expect(added.reply.content).toBe(
    "Added \\*Bins\\* & \\`recycling\\` to the Global Chores.",
  );
  expect(house.run("Alice", { name: "chore list" }).reply.content).toMatch(
    /^\*\*Global\*\*\n- \\\*Bins\\\* & \\`recycling\\`\n\n/,
  );
});

test("Chore names that look like headings, quotes or links show literally", () => {
  const house = createTestHouse();

  house.run("Alice", {
    name: "chore add",
    choreName: "# Kitchen",
    scope: "global",
  });
  house.run("Alice", {
    name: "chore add",
    choreName: "> [Bins](https://example.com)",
    scope: "global",
  });

  expect(house.run("Alice", { name: "chore list" }).reply.content).toMatch(
    /^\*\*Global\*\*\n- \\# Kitchen\n- \\> \\\[Bins\\\]\(https:\/\/example\.com\)\n\n/,
  );
});
