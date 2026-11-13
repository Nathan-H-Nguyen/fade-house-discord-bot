import { SlashCommandBuilder } from "discord.js";
import type { Config } from "../config.ts";
import { maxChoreNameLength, scopeLabels, scopes } from "../house/index.ts";

const scopeChoices = scopes.map((scope) => ({
  name: scopeLabels[scope],
  value: scope,
}));

/** The commands registered in every server. */
const commands = [
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check that the bot is connected"),

  new SlashCommandBuilder()
    .setName("chore")
    .setDescription("Manage the Chore pool and your Assignments")
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Add a Chore to the pool")
        .addStringOption((option) =>
          option
            .setName("name")
            .setDescription("What the Chore is, e.g. Kitchen")
            .setRequired(true)
            .setMaxLength(maxChoreNameLength),
        )
        .addStringOption((option) =>
          option
            .setName("scope")
            .setDescription("Who the Chore can be given to")
            .setRequired(true)
            .addChoices(scopeChoices),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("edit")
        .setDescription("Rename a Chore or change its Scope")
        .addStringOption((option) =>
          option
            .setName("chore")
            .setDescription("The Chore to change")
            .setRequired(true)
            .setMaxLength(maxChoreNameLength)
            .setAutocomplete(true),
        )
        .addStringOption((option) =>
          option
            .setName("name")
            .setDescription("Its new name")
            .setMaxLength(maxChoreNameLength),
        )
        .addStringOption((option) =>
          option
            .setName("scope")
            .setDescription("Who it can be given to from now on")
            .addChoices(scopeChoices),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("retire")
        .setDescription("Take a Chore out of the pool, keeping its history")
        .addStringOption((option) =>
          option
            .setName("chore")
            .setDescription("The Chore to retire")
            .setRequired(true)
            .setMaxLength(maxChoreNameLength)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName("list").setDescription("List the active Chores by Scope"),
    )
    .addSubcommand((sub) =>
      sub.setName("mine").setDescription("List your open Assignments"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("done")
        .setDescription("Mark one of your Assignments complete")
        .addStringOption((option) =>
          option
            .setName("assignment")
            .setDescription("The Assignment you completed")
            .setRequired(true)
            .setMaxLength(maxChoreNameLength)
            .setAutocomplete(true),
        ),
    ),
];

/** Test server only: commands for walking the bot through time. */
const devCommand = new SlashCommandBuilder()
  .setName("dev")
  .setDescription("Test server tools")
  .addSubcommand((sub) =>
    sub
      .setName("advance-to")
      .setDescription("Move the bot's time forward and run any jobs now due")
      .addStringOption((option) =>
        option
          .setName("datetime")
          .setDescription(
            "House time as YYYY-MM-DD HH:MM, e.g. 2026-11-27 09:00",
          )
          .setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub.setName("now").setDescription("Show the bot's time"),
  );

/** The slash commands to register in the configured server. `/dev` exists only in the test server. */
export function commandDefinitions({
  isTestServer,
}: Pick<Config, "isTestServer">) {
  return [...commands, ...(isTestServer ? [devCommand] : [])].map((command) =>
    command.toJSON(),
  );
}
