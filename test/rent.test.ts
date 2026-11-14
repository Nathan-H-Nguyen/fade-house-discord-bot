import { expect, test } from "vitest";
import { createTestHouse, postsIn } from "./harness.ts";

test("an Admin sets a Housemate's Rent in dollars, and the list shows it with everyone else flagged", async () => {
  const house = createTestHouse();

  const set = await house.run(
    "Alice",
    { name: "rent set", memberId: "3001", amount: "1250" },
    { isAdmin: true },
  );

  expect(set.reply).toEqual({
    content: "Set <@3001>'s Rent to $1,250.00.",
    private: true,
  });
  expect((await house.run("Ben", { name: "rent list" })).reply).toEqual({
    content: [
      "**Rent**",
      "- <@1001> (Floor 1): **no Rent set**",
      "- <@1002> (Floor 1): **no Rent set**",
      "- <@3001> (Floor 3): $1,250.00",
      "- <@3002> (Floor 3): **no Rent set**",
      "- <@3003> (Floor 3): **no Rent set**",
      "- <@3004> (Floor 3): **no Rent set**",
    ].join("\n"),
    private: true,
  });
});

test("a Housemate without the Administrator permission is privately refused and sets nothing", async () => {
  const house = createTestHouse();

  const set = await house.run("Alice", {
    name: "rent set",
    memberId: "1001",
    amount: "1",
  });

  expect(set).toEqual({
    reply: {
      content:
        "Only Admins can set Rent. Ask someone with the Administrator permission.",
      private: true,
    },
    outbound: [],
  });
  expect(
    (await house.run("Alice", { name: "rent list" })).reply.content,
  ).toContain("- <@1001> (Floor 1): **no Rent set**");
});

test("setting and changing Rent is logged in #bot-admin with who did it", async () => {
  const house = createTestHouse();

  const set = await house.run(
    "Alice",
    { name: "rent set", memberId: "3002", amount: "900" },
    { isAdmin: true },
  );
  const changed = await house.run(
    "Chloe",
    { name: "rent set", memberId: "3002", amount: "950" },
    { isAdmin: true },
  );

  expect(set.outbound).toEqual([
    { channel: "admin", content: "<@1001> set <@3002>'s Rent to $900.00." },
  ]);
  expect(postsIn(changed.outbound, "admin")).toEqual([
    "<@3001> changed <@3002>'s Rent from $900.00 to $950.00.",
  ]);
  expect(postsIn(changed.outbound, "chores")).toEqual([]);
});

test("an Admin changes a Housemate's Rent, and the reply says what it was", async () => {
  const house = createTestHouse();
  await house.run(
    "Alice",
    { name: "rent set", memberId: "3002", amount: "900" },
    { isAdmin: true },
  );

  const changed = await house.run(
    "Alice",
    { name: "rent set", memberId: "3002", amount: " $1,050.5 " },
    { isAdmin: true },
  );

  expect(changed.reply.content).toBe(
    "Changed <@3002>'s Rent from $900.00 to $1,050.50.",
  );
  expect(
    (await house.run("Dan", { name: "rent list" })).reply.content,
  ).toContain("- <@3002> (Floor 3): $1,050.50");
});

test.each([
  ["twelve", "Give the amount in dollars, such as 1250 or 1250.50."],
  ["12.345", "Give the amount in dollars, such as 1250 or 1250.50."],
  ["-5", "Give the amount in dollars, such as 1250 or 1250.50."],
  ["1,25", "Give the amount in dollars, such as 1250 or 1250.50."],
  ["0.00", "Rent must be more than $0.00."],
  ["100000.01", "Rent can be at most $100,000.00."],
  ["99999999999999999999", "Rent can be at most $100,000.00."],
])("an amount of %j is refused and sets nothing", async (amount, refusal) => {
  const house = createTestHouse();

  const set = await house.run(
    "Alice",
    { name: "rent set", memberId: "1002", amount },
    { isAdmin: true },
  );

  expect(set).toEqual({
    reply: { content: refusal, private: true },
    outbound: [],
  });
  expect(
    (await house.run("Ben", { name: "rent list" })).reply.content,
  ).toContain("- <@1002> (Floor 1): **no Rent set**");
});

test("the largest Rent allowed is $100,000.00", async () => {
  const house = createTestHouse();

  const set = await house.run(
    "Alice",
    { name: "rent set", memberId: "1002", amount: "100,000" },
    { isAdmin: true },
  );

  expect(set.reply.content).toBe("Set <@1002>'s Rent to $100,000.00.");
});

test("Rent is refused for a member who is not a Housemate", async () => {
  const house = createTestHouse();

  const guest = await house.run(
    "Alice",
    { name: "rent set", memberId: "9001", amount: "500" },
    { isAdmin: true },
  );
  const mixed = await house.run(
    "Alice",
    { name: "rent set", memberId: "9002", amount: "500" },
    { isAdmin: true },
  );

  expect(guest).toEqual({
    reply: {
      content:
        "<@9001> is not a Housemate. Give them the Floor 1 or Floor 3 role first.",
      private: true,
    },
    outbound: [],
  });
  expect(mixed).toEqual({
    reply: {
      content:
        "<@9002> has both the Floor 1 and Floor 3 roles, so they are not counted as a Housemate. Remove one first.",
      private: true,
    },
    outbound: [],
  });
});
