import {
  Client,
  Events,
  GatewayIntentBits,
  MessageFlags,
  PermissionFlagsBits,
  REST,
  Routes,
  type ChatInputCommandInteraction,
  type Guild,
} from "discord.js";
import type { Config } from "../config.ts";
import {
  scopes,
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
    if (
      !interaction.isChatInputCommand() ||
      interaction.guildId !== config.guildId
    )
      return;
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
    actor: {
      memberId: interaction.user.id,
      isAdmin:
        interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ??
        false,
    },
    roster: rosterOf(guild),
    command: toCommand(interaction),
  });

  await interaction.reply({
    content: result.reply.content,
    allowedMentions: { parse: [] },
    ...(result.reply.private ? { flags: MessageFlags.Ephemeral } : {}),
  });
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
