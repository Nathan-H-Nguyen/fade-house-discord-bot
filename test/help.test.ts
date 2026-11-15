import { expect, test } from "vitest";
import { commandDefinitions, helpText } from "../src/discord/commands.ts";
import type { Command } from "../src/house/index.ts";
import { createTestHouse } from "./harness.ts";

test("/help lists every user command with its options, grouped under Chores, Rent and Other", () => {
  expect(helpText()).toBe(
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

/** The commands `/help` lists, by the name it shows them under. */
function listedCommands(): string[] {
  return [...helpText().matchAll(/^`\/([a-z-]+(?: [a-z-]+)?)[ `]/gm)].map(
    ([, name]) => name ?? "",
  );
}

test("/help leaves out every command registered for Admins only, and the test server's /dev", () => {
  const hidden = commandDefinitions({ isTestServer: true }).filter(
    (command) =>
      command.default_member_permissions != null || command.name === "dev",
  );

  expect(hidden.map((command) => command.name)).toEqual(["admin", "dev"]);
  for (const { name } of hidden) {
    expect(listedCommands().some((listed) => listed.startsWith(name))).toBe(
      false,
    );
  }
});

/** A Housemate's use of each command, to check that none of those `/help` lists is for Admins only. */
const samples: Record<string, Command> = {
  "chore add": { name: "chore add", choreName: "Kitchen", scope: "global" },
  "chore edit": { name: "chore edit", choreName: "Kitchen", newName: "Sink" },
  "chore retire": { name: "chore retire", choreName: "Sink" },
  "chore list": { name: "chore list" },
  "chore mine": { name: "chore mine" },
  "chore done": { name: "chore done", choreName: "Sink" },
  "rent list": { name: "rent list" },
  "rent paid": { name: "rent paid" },
  ping: { name: "ping" },
  help: { name: "help" },
};

test("every command /help lists works for a Housemate who is not an Admin", async () => {
  const house = createTestHouse();
  const adminRefusal = /Only Admins/;
  // The refusal this test looks for, so it cannot pass by looking for the wrong one.
  const rentSet = await house.run("Alice", {
    name: "rent set",
    memberId: "1001",
    amount: "1000",
  });
  expect(rentSet.reply.content).toMatch(adminRefusal);

  for (const name of listedCommands()) {
    const sample = samples[name];
    expect(sample, `no sample for /${name}`).toBeDefined();
    if (!sample) continue;
    const result = await house.run("Alice", sample);
    expect(result.reply.content, `/${name}`).not.toMatch(adminRefusal);
  }
});

test.each(["Alice", "Guest"] as const)(
  "/help answers %s privately, Housemate or not",
  async (as) => {
    const house = createTestHouse();

    const result = await house.run(as, { name: "help" });

    expect(result.reply).toEqual({ content: helpText(), private: true });
    expect(result.outbound).toEqual([]);
  },
);
