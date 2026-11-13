import { expect, test } from "vitest";
import { commandDefinitions } from "../src/discord/commands.ts";

function subcommandsOf(isTestServer: boolean, command: string): string[] {
  const definition = commandDefinitions({ isTestServer }).find(
    (c) => c.name === command,
  );
  return definition?.options?.map((option) => option.name) ?? [];
}

test("outside the test server no /dev commands are registered", () => {
  const names = commandDefinitions({ isTestServer: false }).map((c) => c.name);

  expect(names).toEqual(["ping", "chore"]);
});

test("in the test server /dev now and /dev advance-to are registered", () => {
  const names = commandDefinitions({ isTestServer: true }).map((c) => c.name);

  expect(names).toEqual(["ping", "chore", "dev"]);
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
