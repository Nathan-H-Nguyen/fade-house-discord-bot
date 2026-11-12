import { expect, test } from "vitest";
import { createTestHouse } from "./harness.ts";

test("a Housemate retires a Chore and it leaves the list", () => {
  const house = createTestHouse();
  house.run("Alice", {
    name: "chore add",
    choreName: "Kitchen",
    scope: "global",
  });
  house.run("Alice", { name: "chore add", choreName: "Bins", scope: "global" });

  const retired = house.run("Dan", {
    name: "chore retire",
    choreName: "Kitchen",
  });

  expect(retired).toEqual({
    reply: {
      content: "Retired Kitchen. It will not be handed out from next month.",
      private: true,
    },
    outbound: [],
  });
  expect(house.run("Alice", { name: "chore list" }).reply.content).toMatch(
    /^\*\*Global\*\*\n- Bins\n\n/,
  );
});

test("a typed Chore name matches regardless of case", () => {
  const house = createTestHouse();
  house.run("Alice", {
    name: "chore add",
    choreName: "Kitchen",
    scope: "global",
  });

  const retired = house.run("Dan", {
    name: "chore retire",
    choreName: "kITCHEN",
  });

  expect(retired.reply.content).toBe(
    "Retired Kitchen. It will not be handed out from next month.",
  );
});

test("retiring a Chore that is not in the pool is refused", () => {
  const house = createTestHouse();
  house.run("Alice", {
    name: "chore add",
    choreName: "Kitchen",
    scope: "global",
  });
  house.run("Alice", { name: "chore retire", choreName: "Kitchen" });

  const again = house.run("Ben", {
    name: "chore retire",
    choreName: "Kitchen",
  });
  const unknown = house.run("Ben", {
    name: "chore retire",
    choreName: "*Bins*",
  });

  expect(again.reply).toEqual({
    content: "There is no active Chore named Kitchen.",
    private: true,
  });
  expect(unknown.reply.content).toBe(
    "There is no active Chore named \\*Bins\\*.",
  );
});

test("a Housemate renames a Chore", () => {
  const house = createTestHouse();
  house.run("Alice", {
    name: "chore add",
    choreName: "Kitchen",
    scope: "floor-1",
  });

  const edited = house.run("Ben", {
    name: "chore edit",
    choreName: "Kitchen",
    newName: "Floor 1 kitchen",
  });

  expect(edited).toEqual({
    reply: { content: "Renamed Kitchen to Floor 1 kitchen.", private: true },
    outbound: [],
  });
  expect(house.run("Ben", { name: "chore list" }).reply.content).toContain(
    "**Floor 1**\n- Floor 1 kitchen\n\n",
  );
});

test("a Housemate moves a Chore to another Scope", () => {
  const house = createTestHouse();
  house.run("Alice", {
    name: "chore add",
    choreName: "Bathroom",
    scope: "global",
  });

  const edited = house.run("Chloe", {
    name: "chore edit",
    choreName: "Bathroom",
    scope: "floor-3",
  });

  expect(edited.reply.content).toBe("Moved Bathroom to the Floor 3 Chores.");
  expect(house.run("Chloe", { name: "chore list" }).reply.content).toBe(
    [
      "**Global**",
      "None",
      "",
      "**Floor 1**",
      "None",
      "",
      "**Floor 3**",
      "- Bathroom",
    ].join("\n"),
  );
});

test("a Housemate renames and moves a Chore at once", () => {
  const house = createTestHouse();
  house.run("Alice", {
    name: "chore add",
    choreName: "Bathroom",
    scope: "global",
  });

  const edited = house.run("Alice", {
    name: "chore edit",
    choreName: "Bathroom",
    newName: "Floor 1 bathroom",
    scope: "floor-1",
  });

  expect(edited.reply.content).toBe(
    "Renamed Bathroom to Floor 1 bathroom and moved it to the Floor 1 Chores.",
  );
  expect(house.run("Alice", { name: "chore list" }).reply.content).toContain(
    "**Floor 1**\n- Floor 1 bathroom\n\n",
  );
});

test("an edit that changes nothing is refused", () => {
  const house = createTestHouse();
  house.run("Alice", {
    name: "chore add",
    choreName: "Kitchen",
    scope: "global",
  });

  const empty = house.run("Alice", {
    name: "chore edit",
    choreName: "Kitchen",
  });
  const same = house.run("Alice", {
    name: "chore edit",
    choreName: "kitchen",
    newName: "Kitchen",
    scope: "global",
  });

  expect(empty.reply).toEqual({
    content: "Give Kitchen a new name, a new Scope or both.",
    private: true,
  });
  expect(same.reply.content).toBe("Kitchen already has that name and Scope.");
});

test("a new name is trimmed, and a blank or overlong one is refused", () => {
  const house = createTestHouse();
  house.run("Alice", {
    name: "chore add",
    choreName: "Kitchen",
    scope: "global",
  });

  const blank = house.run("Alice", {
    name: "chore edit",
    choreName: "Kitchen",
    newName: "   ",
  });
  const overlong = house.run("Alice", {
    name: "chore edit",
    choreName: "Kitchen",
    newName: "x".repeat(101),
  });
  const padded = house.run("Alice", {
    name: "chore edit",
    choreName: "Kitchen",
    newName: "  Galley  ",
  });

  expect(blank.reply.content).toBe("A Chore needs a name.");
  expect(overlong.reply.content).toBe(
    "A Chore name can be at most 100 characters.",
  );
  expect(padded.reply.content).toBe("Renamed Kitchen to Galley.");
  expect(house.run("Alice", { name: "chore list" }).reply.content).toMatch(
    /^\*\*Global\*\*\n- Galley\n\n/,
  );
});

test("adding a Chore whose name is already active is refused, ignoring case", () => {
  const house = createTestHouse();
  house.run("Alice", {
    name: "chore add",
    choreName: "Kitchen",
    scope: "global",
  });

  const duplicate = house.run("Chloe", {
    name: "chore add",
    choreName: " KITCHEN ",
    scope: "floor-3",
  });

  expect(duplicate.reply).toEqual({
    content: "There is already a Chore named Kitchen.",
    private: true,
  });
  expect(house.run("Chloe", { name: "chore list" }).reply.content).toBe(
    [
      "**Global**",
      "- Kitchen",
      "",
      "**Floor 1**",
      "None",
      "",
      "**Floor 3**",
      "None",
    ].join("\n"),
  );
});

test("renaming a Chore to another active Chore's name is refused, ignoring case", () => {
  const house = createTestHouse();
  house.run("Alice", {
    name: "chore add",
    choreName: "Kitchen",
    scope: "global",
  });
  house.run("Alice", { name: "chore add", choreName: "Bins", scope: "global" });

  const duplicate = house.run("Alice", {
    name: "chore edit",
    choreName: "Bins",
    newName: "kitchen",
  });

  expect(duplicate.reply.content).toBe(
    "There is already a Chore named Kitchen.",
  );
  expect(house.run("Alice", { name: "chore list" }).reply.content).toMatch(
    /^\*\*Global\*\*\n- Bins\n- Kitchen\n\n/,
  );
});

test("a Chore can be renamed to a different case of its own name", () => {
  const house = createTestHouse();
  house.run("Alice", {
    name: "chore add",
    choreName: "kitchen",
    scope: "global",
  });

  const edited = house.run("Alice", {
    name: "chore edit",
    choreName: "kitchen",
    newName: "Kitchen",
  });

  expect(edited.reply.content).toBe("Renamed kitchen to Kitchen.");
});

test("a retired Chore's name can be used again", () => {
  const house = createTestHouse();
  house.run("Alice", {
    name: "chore add",
    choreName: "Kitchen",
    scope: "global",
  });
  house.run("Alice", { name: "chore retire", choreName: "Kitchen" });

  const added = house.run("Alice", {
    name: "chore add",
    choreName: "Kitchen",
    scope: "floor-1",
  });

  expect(added.reply.content).toBe("Added Kitchen to the Floor 1 Chores.");
});

test("members who are not Housemates cannot edit or retire Chores", () => {
  const house = createTestHouse();
  house.run("Alice", {
    name: "chore add",
    choreName: "Kitchen",
    scope: "global",
  });

  const edited = house.run("Guest", {
    name: "chore edit",
    choreName: "Kitchen",
    newName: "Galley",
  });
  const retired = house.run("Mixed", {
    name: "chore retire",
    choreName: "Kitchen",
  });

  expect(edited.reply.content).toBe(
    "Only Housemates can use this command. Ask an Admin to give you the Floor 1 or Floor 3 role.",
  );
  expect(retired.reply.content).toMatch(
    /^You have both the Floor 1 and Floor 3 roles/,
  );
  expect(house.run("Alice", { name: "chore list" }).reply.content).toMatch(
    /^\*\*Global\*\*\n- Kitchen\n\n/,
  );
});

test("Chore autocomplete suggests active Chores containing the typed text", () => {
  const house = createTestHouse();
  house.run("Alice", {
    name: "chore add",
    choreName: "Kitchen",
    scope: "global",
  });
  house.run("Alice", {
    name: "chore add",
    choreName: "Floor 3 kitchen",
    scope: "floor-3",
  });
  house.run("Alice", { name: "chore add", choreName: "Bins", scope: "global" });
  house.run("Alice", {
    name: "chore add",
    choreName: "Old kitchen",
    scope: "global",
  });
  house.run("Alice", { name: "chore retire", choreName: "Old kitchen" });

  expect(house.suggest("Chloe", { name: "chore", text: "KITCH" })).toEqual([
    { label: "Floor 3 kitchen (Floor 3)", value: "Floor 3 kitchen" },
    { label: "Kitchen (Global)", value: "Kitchen" },
  ]);
  expect(house.suggest("Chloe", { name: "chore", text: "" })).toHaveLength(3);
});

test("Chore autocomplete suggests nothing to members who are not Housemates", () => {
  const house = createTestHouse();
  house.run("Alice", {
    name: "chore add",
    choreName: "Kitchen",
    scope: "global",
  });

  expect(house.suggest("Guest", { name: "chore", text: "" })).toEqual([]);
});

test("Chore autocomplete stays within Discord's limits", () => {
  const house = createTestHouse();
  const longName = "x".repeat(95);
  house.run("Alice", {
    name: "chore add",
    choreName: longName,
    scope: "global",
  });
  for (let i = 10; i < 40; i++) {
    house.run("Alice", {
      name: "chore add",
      choreName: `Chore ${String(i)}`,
      scope: "global",
    });
  }

  const all = house.suggest("Alice", { name: "chore", text: "" });
  const long = house.suggest("Alice", { name: "chore", text: "xxx" });

  expect(all).toHaveLength(25);
  expect(all[0]).toEqual({ label: "Chore 10 (Global)", value: "Chore 10" });
  expect(long).toEqual([{ label: longName, value: longName }]);
});
