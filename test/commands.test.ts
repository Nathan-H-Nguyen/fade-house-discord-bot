import { expect, test } from "vitest";
import { ApplicationCommandOptionType } from "discord.js";
import { commandDefinitions } from "../src/discord/commands.ts";

function subcommandsOf(isTestServer: boolean, command: string): string[] {
  const definition = commandDefinitions({ isTestServer }).find(
    (c) => c.name === command,
  );
  return definition?.options?.map((option) => option.name) ?? [];
}

test("outside the test server no /dev commands are registered", () => {
  const names = commandDefinitions({ isTestServer: false }).map((c) => c.name);

  expect(names).toEqual(["ping", "chore", "rent"]);
});

test("in the test server /dev now and /dev advance-to are registered", () => {
  const names = commandDefinitions({ isTestServer: true }).map((c) => c.name);

  expect(names).toEqual(["ping", "chore", "rent", "dev"]);
  expect(subcommandsOf(true, "dev")).toEqual(["advance-to", "now"]);
});

test("/chore done takes an autocompleted Assignment, and /chore mine takes nothing", () => {
  const chore = commandDefinitions({ isTestServer: false }).find(
    (c) => c.name === "chore",
  );
  const subcommand = (name: string) =>
    chore?.options?.find((option) => option.name === name);

  expect(subcommand("mine")).toMatchObject({ options: [] });
  expect(subcommand("done")).toMatchObject({
    options: [{ name: "assignment", required: true, autocomplete: true }],
  });
});

test("/rent set takes a member and a dollar amount, and /rent list takes nothing", () => {
  const rent = commandDefinitions({ isTestServer: false }).find(
    (c) => c.name === "rent",
  );

  expect(rent?.default_member_permissions).toBeUndefined();
  expect(rent?.options).toMatchObject([
    {
      name: "set",
      options: [
        {
          name: "housemate",
          type: ApplicationCommandOptionType.User,
          required: true,
        },
        {
          name: "amount",
          type: ApplicationCommandOptionType.String,
          required: true,
        },
      ],
    },
    { name: "list", options: [] },
  ]);
});
