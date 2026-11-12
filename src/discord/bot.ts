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
  type Outbound,
  type Roster,
  type Scope,
} from "../house/index.ts";
import { commandDefinitions } from "./commands.ts";

/** Replaces the slash commands in the configured guild, where changes apply immediately. */
export async function registerCommands(config: Config): Promise<void> {
  const rest = new REST().setToken(config.discordToken);
  await rest.put(
    Routes.applicationGuildCommands(config.applicationId, config.guildId),
    { body: commandDefinitions(config) },
  );
}

/** How often the House checks for scheduled jobs that are due. */
const tickIntervalMs = 60_000;

export interface Bot {
  /** Stops ticking and disconnects from Discord. */
  stop(): Promise<void>;
}

/**
 * Connects to Discord, passes slash commands from the configured guild to the House,
 * and ticks the House on startup and about once a minute.
 */
export async function startBot(config: Config, house: House): Promise<Bot> {
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

  const deliver = deliverTo(client, config);
  client.on(Events.InteractionCreate, (interaction) => {
    if (interaction.guildId !== config.guildId) return;
    if (interaction.isAutocomplete()) {
      handleAutocomplete(interaction, house).catch((error: unknown) => {
        console.error(`/${interaction.commandName} autocomplete failed`, error);
      });
      return;
    }
    if (!interaction.isChatInputCommand()) return;
    handleCommand(interaction, house, deliver).catch((error: unknown) => {
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

  function tick(): void {
    house
      .tick()
      .then(deliver)
      .catch((error: unknown) => {
        console.error("Scheduled jobs failed", error);
      });
  }
  tick();
  const ticker = setInterval(tick, tickIntervalMs);

  return {
    async stop() {
      clearInterval(ticker);
      await client.destroy();
    },
  };
}

/** Posts the House's outbound messages in their channels, in order. */
function deliverTo(
  client: Client,
  config: Config,
): (messages: readonly Outbound[]) => Promise<void> {
  const channelIds: Record<Outbound["channel"], string> = {
    admin: config.adminChannelId,
  };

  return async (messages) => {
    for (const message of messages) {
      const channelId = channelIds[message.channel];
      const channel = await client.channels.fetch(channelId);
      if (!channel?.isSendable()) {
        throw new Error(`Cannot post in channel ${channelId}`);
      }
      const { attachment } = message;
      try {
        await channel.send({
          content: message.content,
          allowedMentions: { parse: [] },
          files: attachment
            ? [
                {
                  attachment: Buffer.from(attachment.data),
                  name: attachment.name,
                },
              ]
            : [],
        });
      } catch (error) {
        if (!attachment) throw error;
        // The House has already recorded the job as done, so a refused upload must not vanish silently.
        const reason = error instanceof Error ? error.message : String(error);
        await channel.send({
          content: `${message.content}\nDiscord refused the attachment ${attachment.name}: ${reason}`,
          allowedMentions: { parse: [] },
        });
      }
    }
  };
}

async function handleCommand(
  interaction: ChatInputCommandInteraction,
  house: House,
  deliver: (messages: readonly Outbound[]) => Promise<void>,
): Promise<void> {
  const guild = interaction.guild;
  if (!guild) throw new Error("Command arrived without a cached guild");

  const command = toCommand(interaction);
  // Moving the time runs any jobs now due, such as a backup, which can outlast Discord's 3-second
  // reply deadline. Its reply is always private, so it can be deferred as private up front.
  const slow = command.name === "dev advance-to";
  if (slow) await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const result = await house.handle({
    actor: actorOf(interaction),
    roster: rosterOf(guild),
    command,
  });

  const reply = {
    content: result.reply.content,
    allowedMentions: { parse: [] },
  };
  if (slow) await interaction.editReply(reply);
  else {
    await interaction.reply({
      ...reply,
      ...(result.reply.private ? { flags: MessageFlags.Ephemeral } : {}),
    });
  }
  await deliver(result.outbound);
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
    case "dev now":
      return { name: "dev now" };
    case "dev advance-to":
      return {
        name: "dev advance-to",
        to: interaction.options.getString("datetime", true),
      };
    default:
      throw new Error(`Unknown command /${name}`);
  }
}

function toScope(value: string): Scope {
  const scope = scopes.find((s) => s === value);
  if (!scope) throw new Error(`Unknown Scope "${value}"`);
  return scope;
}
