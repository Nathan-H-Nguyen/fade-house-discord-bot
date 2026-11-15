import { expect, test } from "vitest";
import { helpText } from "../src/discord/commands.ts";
import { createTestHouse } from "./harness.ts";

test("/help lists every user command with its options, grouped under Chores, Rent and Other", () => {
  expect(helpText({ isTestServer: false })).toBe(
    [
      "**Chores**",
      "`/chore add <name> <scope>`: Add a Chore to the pool",
      "`/chore edit <chore> [name] [scope]`: Rename a Chore or change its Scope",
      "`/chore retire <chore>`: Take a Chore out of the pool, keeping its history",
      "`/chore list`: List the active Chores by Scope",
      "`/chore mine`: List your open Assignments",
      "`/chore done <assignment>`: Mark one of your Assignments complete",
      "",
      "**Rent**",
      "`/rent list`: List every Housemate's Rent and who has paid",
      "`/rent paid`: Mark your Rent paid for the current month",
      "",
      "**Other**",
      "`/ping`: Check that the bot is connected",
      "`/help`: List the commands you can use",
    ].join("\n"),
  );
});

test.each([false, true])(
  "/help never lists /admin, /dev or /rent set (test server: %s)",
  (isTestServer) => {
    const text = helpText({ isTestServer });

    expect(text).not.toMatch(/\/admin|\/dev|\/rent set/);
    expect(text).toBe(helpText({ isTestServer: false }));
  },
);

test.each(["Alice", "Guest"] as const)(
  "/help answers %s privately, Housemate or not",
  async (as) => {
    const house = createTestHouse();

    const result = await house.run(as, { name: "help" });

    expect(result.reply).toEqual({
      content: helpText({ isTestServer: false }),
      private: true,
    });
    expect(result.outbound).toEqual([]);
  },
);
