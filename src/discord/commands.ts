import { SlashCommandBuilder } from "discord.js";
import { maxChoreNameLength, scopeLabels, scopes } from "../house/index.ts";

const scopeChoices = scopes.map((scope) => ({
  name: scopeLabels[scope],
  value: scope,
}));

/** The slash commands registered in the house server. */
export const commandDefinitions = [
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check that the bot is connected"),

  new SlashCommandBuilder()
    .setName("chore")
    .setDescription("Manage the Chore pool")
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
    ),
].map((command) => command.toJSON());
