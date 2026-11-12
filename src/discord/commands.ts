import { SlashCommandBuilder } from "discord.js";
import { maxChoreNameLength, scopeLabels, scopes } from "../house/index.ts";

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
            .addChoices(
              scopes.map((scope) => ({
                name: scopeLabels[scope],
                value: scope,
              })),
            ),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName("list").setDescription("List the active Chores by Scope"),
    ),
].map((command) => command.toJSON());
