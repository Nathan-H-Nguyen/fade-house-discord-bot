import {
  Client,
  Events,
  GatewayIntentBits,
  MessageFlags,
  PermissionFlagsBits,
  REST,
  Routes,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  type Guild,
} from "discord.js";
import type { Config } from "../config.ts";
import {
  scopes,
  type Actor,
  type Command,
  type House,
  type Roster,
  type Scope,
} from "../house/index.ts";
import { commandDefinitions } from "./commands.ts";

/** Replaces the slash commands in the configured guild, where changes apply immediately. */
export async function registerCommands(config: Config): Promise<void> {
  const rest = new REST().setToken(config.discordToken);
  await rest.put(
    Routes.applicationGuildCommands(config.applicationId, config.guildId),
    {
      body: commandDefinitions,
    },
  );
}

/** Connects to Discord and passes slash commands from the configured guild to the House. */
export async function startBot(config: Config, house: House): Promise<Client> {
  // Server Members is a privileged intent; it must be enabled in the Developer Portal.
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  });

  const ready = new Promise<Client<true>>((resolve) => {
    client.once(Events.ClientReady, resolve);
  });
  await client.login(config.discordToken);
  console.log(`Logged in as ${(await ready).user.tag}`);

  // Load every member once; the Server Members intent keeps the cache current from then on,
  // so commands read the roster without waiting on Discord before their reply deadline.
  const guild = await client.guilds.fetch(config.guildId);
  await guild.members.fetch();

  client.on(Events.InteractionCreate, (interaction) => {
    if (interaction.guildId !== config.guildId) return;
    if (interaction.isAutocomplete()) {
      handleAutocomplete(interaction, house).catch((error: unknown) => {
        console.error(`/${interaction.commandName} autocomplete failed`, error);
      });
      return;
    }
    if (!interaction.isChatInputCommand()) return;
    handleCommand(interaction, house).catch((error: unknown) => {
      console.error(`/${interaction.commandName} failed`, error);
      const reply = {
        content: "Something went wrong. Please try again.",
        flags: MessageFlags.Ephemeral,
      } as const;
      const send =
        interaction.replied || interaction.deferred
          ? interaction.followUp(reply)
          : interaction.reply(reply);
      send.catch((replyError: unknown) => {
        console.error("Could not report the failure", replyError);
      });
    });
  });

  return client;
}

async function handleCommand(
  interaction: ChatInputCommandInteraction,
  house: House,
): Promise<void> {
  const guild = interaction.guild;
  if (!guild) throw new Error("Command arrived without a cached guild");

  const result = house.handle({
    actor: actorOf(interaction),
    roster: rosterOf(guild),
    command: toCommand(interaction),
  });

  await interaction.reply({
    content: result.reply.content,
    allowedMentions: { parse: [] },
    ...(result.reply.private ? { flags: MessageFlags.Ephemeral } : {}),
  });
}

async function handleAutocomplete(
  interaction: AutocompleteInteraction,
  house: House,
): Promise<void> {
  const guild = interaction.guild;
  if (!guild) throw new Error("Autocomplete arrived without a cached guild");

  const focused = interaction.options.getFocused(true);
  if (focused.name !== "chore") {
    // Answer anyway, so Discord shows an empty list rather than an error.
    console.error(
      `/${interaction.commandName} has no autocomplete for "${focused.name}"`,
    );
    await interaction.respond([]);
    return;
  }
  const suggestions = house.suggest({
    actor: actorOf(interaction),
    roster: rosterOf(guild),
    field: { name: "chore", text: focused.value },
  });

  await interaction.respond(
    suggestions.map((s) => ({ name: s.label, value: s.value })),
  );
}

function actorOf(
  interaction: ChatInputCommandInteraction | AutocompleteInteraction,
): Actor {
  return {
    memberId: interaction.user.id,
    isAdmin:
      interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ??
      false,
  };
}

function rosterOf(guild: Guild): Roster {
  return guild.members.cache.map((member) => ({
    id: member.id,
    displayName: member.displayName,
    isBot: member.user.bot,
    roleNames: member.roles.cache.map((role) => role.name),
  }));
}

function toCommand(interaction: ChatInputCommandInteraction): Command {
  const name = [
    interaction.commandName,
    interaction.options.getSubcommand(false),
  ]
    .filter(Boolean)
    .join(" ");
  switch (name) {
    case "ping":
      return { name: "ping" };
    case "chore add":
      return {
        name: "chore add",
        choreName: interaction.options.getString("name", true),
        scope: toScope(interaction.options.getString("scope", true)),
      };
    case "chore edit": {
      const newName = interaction.options.getString("name");
      const scope = interaction.options.getString("scope");
      return {
        name: "chore edit",
        choreName: interaction.options.getString("chore", true),
        ...(newName === null ? {} : { newName }),
        ...(scope === null ? {} : { scope: toScope(scope) }),
      };
    }
    case "chore retire":
      return {
        name: "chore retire",
        choreName: interaction.options.getString("chore", true),
      };
    case "chore list":
      return { name: "chore list" };
    default:
      throw new Error(`Unknown command /${name}`);
  }
}

function toScope(value: string): Scope {
  const scope = scopes.find((s) => s === value);
  if (!scope) throw new Error(`Unknown Scope "${value}"`);
  return scope;
}
