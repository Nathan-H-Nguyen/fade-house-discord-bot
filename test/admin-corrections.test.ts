import { expect, test } from "vitest";
import type { Command, Scope } from "../src/house/index.ts";
import {
  createTestHouse,
  membersNamed,
  postsIn,
  type TestHouse,
} from "./harness.ts";

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

test.each<Command>([
  { name: "admin chore-done", memberId: "1001", choreName: "Kitchen" },
  { name: "admin chore-reopen", memberId: "1001", choreName: "Kitchen" },
  { name: "admin rent-paid", memberId: "1001", paid: true },
  { name: "admin reassign" },
])(
  "a Housemate without the Administrator permission is privately refused $name, and nothing changes",
  async (command) => {
    const house = await houseInDecember();

    const refused = await house.run("Ben", command);

    expect(refused).toEqual({
      reply: {
        content:
          "Only Admins can use /admin. Ask someone with the Administrator permission.",
        private: true,
      },
      outbound: [],
    });
    expect(
      (await house.run("Alice", { name: "chore mine" })).reply.content,
    ).toBe(
      [
        "Your open Assignments:",
        "- Bathroom (Floor 1)",
        "- Kitchen (Global)",
      ].join("\n"),
    );
  },
);

test("an Admin completes a Housemate's Assignment on their behalf, which #chores sees and #bot-admin logs", async () => {
  const house = await houseInDecember();

  const done = await house.run(
    "Ben",
    { name: "admin chore-done", memberId: "3001", choreName: " hallway " },
    { isAdmin: true },
  );

  expect(done).toEqual({
    reply: { content: "Marked <@3001>'s Hallway complete.", private: true },
    outbound: [
      { channel: "chores", content: "<@3001> completed Hallway." },
      {
        channel: "admin",
        content: "<@1002> marked <@3001>'s Hallway complete.",
      },
    ],
  });
  expect((await house.run("Chloe", { name: "chore mine" })).reply.content).toBe(
    ["Your open Assignments:", "- Stairs (Floor 3)"].join("\n"),
  );
});

test("an Admin completing an Assignment the Housemate has not got open is refused, and nothing is logged", async () => {
  const house = await houseInDecember();
  await house.run("Chloe", { name: "chore done", choreName: "Hallway" });

  const completed = await house.run(
    "Ben",
    { name: "admin chore-done", memberId: "3001", choreName: "Hallway" },
    { isAdmin: true },
  );
  const someoneElses = await house.run(
    "Ben",
    { name: "admin chore-done", memberId: "3001", choreName: "Kitchen" },
    { isAdmin: true },
  );

  expect(completed).toEqual({
    reply: { content: "<@3001> has already completed Hallway.", private: true },
    outbound: [],
  });
  expect(someoneElses).toEqual({
    reply: {
      content: "<@3001> has no open Assignment named Kitchen.",
      private: true,
    },
    outbound: [],
  });
});

test("an Admin reopens an Assignment a Housemate completed this month, which #bot-admin logs", async () => {
  const house = await houseInDecember();
  await house.run("Chloe", { name: "chore done", choreName: "Hallway" });

  const reopened = await house.run(
    "Ben",
    { name: "admin chore-reopen", memberId: "3001", choreName: "HALLWAY" },
    { isAdmin: true },
  );

  expect(reopened).toEqual({
    reply: { content: "Reopened <@3001>'s Hallway.", private: true },
    outbound: [
      { channel: "admin", content: "<@1002> reopened <@3001>'s Hallway." },
    ],
  });
  expect((await house.run("Chloe", { name: "chore mine" })).reply.content).toBe(
    [
      "Your open Assignments:",
      "- Hallway (Floor 3)",
      "- Stairs (Floor 3)",
    ].join("\n"),
  );
});

test("an Admin reopening an Assignment that is open, or was not completed this month, is refused", async () => {
  const house = await houseInDecember();
  await house.run("Chloe", { name: "chore done", choreName: "Hallway" });
  await house.run("Alice", { name: "chore done", choreName: "Kitchen" });
  house.setTime("2027-01-01T00:05:00-08:00");
  // Hallway goes to Dan in January, since Chloe had it in December.
  await house.tick({ members: membersNamed("Alice", "Chloe", "Dan") });
  house.setTime("2027-01-02T10:00:00-08:00");

  const open = await house.run(
    "Ben",
    { name: "admin chore-reopen", memberId: "1001", choreName: "Bathroom" },
    { isAdmin: true },
  );
  const lastMonth = await house.run(
    "Ben",
    { name: "admin chore-reopen", memberId: "3001", choreName: "Hallway" },
    { isAdmin: true },
  );

  expect(open).toEqual({
    reply: { content: "<@1001>'s Bathroom is not complete.", private: true },
    outbound: [],
  });
  expect(lastMonth).toEqual({
    reply: {
      content: "<@3001> has completed no Assignment named Hallway this month.",
      private: true,
    },
    outbound: [],
  });
});

test("an Admin reopens an Overdue Assignment completed this month, and it is overdue again", async () => {
  const house = await houseInDecember();
  house.setTime("2027-01-01T00:05:00-08:00");
  await house.tick({ members: membersNamed("Alice", "Chloe") });
  house.setTime("2027-01-02T10:00:00-08:00");
  await house.run("Alice", { name: "chore done", choreName: "Kitchen" });

  const reopened = await house.run(
    "Ben",
    { name: "admin chore-reopen", memberId: "1001", choreName: "Kitchen" },
    { isAdmin: true },
  );

  expect(reopened.reply.content).toBe("Reopened <@1001>'s Kitchen.");
  expect((await house.run("Alice", { name: "chore mine" })).reply.content).toBe(
    [
      "Your open Assignments:",
      "- Bathroom (Floor 1, overdue from December 2026)",
      "- Kitchen (Global, overdue from December 2026)",
    ].join("\n"),
  );
});

/** A House on November 28th, in the rent period for December, where Alice owes $1,250 and Chloe $900. */
async function houseOwingRent(): Promise<TestHouse> {
  const house = createTestHouse({ now: "2026-11-12T10:00:00-08:00" });
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
  house.setTime("2026-11-28T10:00:00-08:00");
  await house.tick();
  return house;
}

async function rentList(house: TestHouse): Promise<string> {
  return (await house.run("Ben", { name: "rent list" })).reply.content;
}

test("an Admin marks a Housemate's Rent paid, which #bot-admin logs, and #chores hears once everyone has paid", async () => {
  const house = await houseOwingRent();
  await house.run("Chloe", { name: "rent paid" });

  const paid = await house.run(
    "Ben",
    { name: "admin rent-paid", memberId: "1001", paid: true },
    { isAdmin: true },
  );

  expect(paid).toEqual({
    reply: {
      content: "Marked <@1001>'s Rent for December 2026 paid.",
      private: true,
    },
    outbound: [
      {
        channel: "admin",
        content: "<@1002> marked <@1001>'s Rent for December 2026 paid.",
      },
      {
        channel: "chores",
        content: "Everyone has paid their Rent for December 2026.",
      },
    ],
  });
  expect(await rentList(house)).toContain(
    "- <@1001> (Floor 1): $1,250.00, paid",
  );
});

test("an Admin unmarks a Housemate's Rent, which #bot-admin logs, and their Rent Reminders resume", async () => {
  const house = await houseOwingRent();
  await house.run("Alice", { name: "rent paid" });

  const unpaid = await house.run(
    "Ben",
    { name: "admin rent-paid", memberId: "1001", paid: false },
    { isAdmin: true },
  );

  expect(unpaid).toEqual({
    reply: {
      content: "Marked <@1001>'s Rent for December 2026 not paid.",
      private: true,
    },
    outbound: [
      {
        channel: "admin",
        content: "<@1002> marked <@1001>'s Rent for December 2026 not paid.",
      },
    ],
  });
  expect(await rentList(house)).toContain(
    "- <@1001> (Floor 1): $1,250.00, **not paid**",
  );
  house.setTime("2026-11-29T09:00:00-08:00");
  const reminded = (await house.tick()).flatMap((m) =>
    "memberId" in m ? [m.memberId] : [],
  );
  expect(reminded).toEqual(["1001", "3001"]);
});

test.each([
  [
    { memberId: "1001", paid: true },
    "<@1001> has already paid their Rent for December 2026.",
  ],
  [
    { memberId: "3001", paid: false },
    "<@3001> has not paid their Rent for December 2026.",
  ],
  [
    { memberId: "1002", paid: true },
    "<@1002> has no Rent set. Set it with /rent set first.",
  ],
])(
  "an Admin marking Rent %j that cannot change is refused",
  async (options, refusal) => {
    const house = await houseOwingRent();
    await house.run("Alice", { name: "rent paid" });

    const result = await house.run(
      "Ben",
      { name: "admin rent-paid", ...options },
      { isAdmin: true },
    );

    expect(result).toEqual({
      reply: { content: refusal, private: true },
      outbound: [],
    });
  },
);

test("an Admin marking Rent paid before the first rent period has started is refused", async () => {
  const house = createTestHouse();
  await house.tick();
  await house.run(
    "Alice",
    { name: "rent set", memberId: "1001", amount: "1250" },
    { isAdmin: true },
  );

  const paid = await house.run(
    "Ben",
    { name: "admin rent-paid", memberId: "1001", paid: true },
    { isAdmin: true },
  );

  expect(paid).toEqual({
    reply: {
      content:
        "The first rent period, for December 2026, starts on November 27 at 09:00, and Rent can be marked paid then.",
      private: true,
    },
    outbound: [],
  });
});

test("an Admin reassigns the month, handing out its open new Assignments again and keeping completed and Overdue ones", async () => {
  const house = await houseInDecember();
  await house.run("Alice", { name: "chore done", choreName: "Kitchen" });
  await house.run("Chloe", { name: "chore done", choreName: "Hallway" });
  await house.run("Chloe", { name: "chore done", choreName: "Stairs" });
  // Ben and Dan were missing their floor roles on the 1st, so Chloe got every Chore Alice did not keep.
  house.setTime("2027-01-01T00:05:00-08:00");
  await house.tick({ members: membersNamed("Alice", "Chloe") });
  house.setTime("2027-01-02T10:00:00-08:00");
  await house.run("Chloe", { name: "chore done", choreName: "Stairs" });

  const reassigned = await house.run(
    "Alice",
    { name: "admin reassign" },
    { isAdmin: true, members: membersNamed("Alice", "Ben", "Chloe", "Dan") },
  );

  // Alice keeps her Overdue Bathroom and Chloe her completed Stairs, which counts toward her share.
  // Hallway avoids Chloe, who had it in December, and Kitchen avoids Alice, who had it then,
  // and goes to Ben, who has fewer Assignments than Chloe and Dan.
  expect(reassigned).toEqual({
    reply: {
      content: "Reassigned the Chores for January 2027.",
      private: true,
    },
    outbound: [
      {
        channel: "admin",
        content: "<@1001> reassigned the Chores for January 2027.",
      },
      {
        channel: "chores",
        content: [
          "**Chores for January 2027, reassigned**",
          "",
          "<@1001>",
          "- Bathroom (Floor 1, overdue from December 2026)",
          "",
          "<@1002>",
          "- Kitchen (Global)",
          "",
          "<@3002>",
          "- Hallway (Floor 3)",
        ].join("\n"),
      },
      {
        memberId: "1001",
        content: [
          "Your Chores for January 2027, reassigned:",
          "- Bathroom (Floor 1, overdue from December 2026)",
        ].join("\n"),
        ifUndelivered: {
          channel: "chores",
          content:
            "Could not DM <@1001> their Chores for January 2027. They are in the post above.",
        },
      },
      {
        memberId: "1002",
        content: [
          "Your Chores for January 2027, reassigned:",
          "- Kitchen (Global)",
        ].join("\n"),
        ifUndelivered: {
          channel: "chores",
          content:
            "Could not DM <@1002> their Chores for January 2027. They are in the post above.",
        },
      },
      {
        memberId: "3002",
        content: [
          "Your Chores for January 2027, reassigned:",
          "- Hallway (Floor 3)",
        ].join("\n"),
        ifUndelivered: {
          channel: "chores",
          content:
            "Could not DM <@3002> their Chores for January 2027. They are in the post above.",
        },
      },
    ],
  });
  expect((await house.run("Chloe", { name: "chore mine" })).reply.content).toBe(
    "You have no open Assignments.",
  );
  expect(
    (
      await house.run(
        "Ben",
        {
          name: "admin chore-reopen",
          memberId: "3001",
          choreName: "Stairs",
        },
        { isAdmin: true },
      )
    ).reply.content,
  ).toBe("Reopened <@3001>'s Stairs.");
});

test("an Admin reassigning before the month's Chores are handed out is refused", async () => {
  const house = createTestHouse();
  await house.tick();

  const reassigned = await house.run(
    "Alice",
    { name: "admin reassign" },
    { isAdmin: true },
  );

  expect(reassigned).toEqual({
    reply: {
      content:
        "The Chores for November 2026 have not been handed out yet, so there is nothing to reassign.",
      private: true,
    },
    outbound: [],
  });
});

test("reassigning does not hand out a Chore again whose Overdue Assignment was completed this month", async () => {
  const house = await houseInDecember();
  house.setTime("2027-01-01T00:05:00-08:00");
  await house.tick({ members: membersNamed("Alice", "Chloe") });
  house.setTime("2027-01-02T10:00:00-08:00");
  await house.run("Alice", { name: "chore done", choreName: "Bathroom" });

  // Ben could take Bathroom, but Alice's Overdue Assignment covered it this month.
  const reassigned = await house.run(
    "Alice",
    { name: "admin reassign" },
    { isAdmin: true, members: membersNamed("Alice", "Ben", "Chloe", "Dan") },
  );

  expect(postsIn(reassigned.outbound, "chores")).toEqual([
    [
      "**Chores for January 2027, reassigned**",
      "",
      "<@1001>",
      "- Kitchen (Global, overdue from December 2026)",
      "",
      "<@3001>",
      "- Hallway (Floor 3, overdue from December 2026)",
      "- Stairs (Floor 3, overdue from December 2026)",
    ].join("\n"),
  ]);
});

test("an Admin's Assignment autocomplete suggests the chosen Housemate's open Assignments, or those they completed this month", async () => {
  const house = await houseInDecember();
  await house.run("Chloe", { name: "chore done", choreName: "Hallway" });
  const field = (completed: boolean, text = "") => ({
    name: "assignment of" as const,
    memberId: "3001",
    completed,
    text,
  });

  expect(house.suggest("Ben", field(false), { isAdmin: true })).toEqual([
    { label: "Stairs (Floor 3)", value: "Stairs" },
  ]);
  expect(house.suggest("Ben", field(true, "HALL"), { isAdmin: true })).toEqual([
    { label: "Hallway (Floor 3)", value: "Hallway" },
  ]);
  expect(
    house.suggest("Ben", field(true, "Stairs"), { isAdmin: true }),
  ).toEqual([]);
  expect(house.suggest("Ben", field(false))).toEqual([]);
});

test("reassigning does not report members with both floor roles again, since the monthly run already did", async () => {
  const house = await houseInDecember();

  const reassigned = await house.run(
    "Alice",
    { name: "admin reassign" },
    { isAdmin: true, members: membersNamed("Alice", "Chloe", "Mixed") },
  );

  expect(postsIn(reassigned.outbound, "admin")).toEqual([
    "<@1001> reassigned the Chores for December 2026.",
  ]);
});
