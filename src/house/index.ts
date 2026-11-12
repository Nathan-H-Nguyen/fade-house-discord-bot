/**
 * The House core: every behaviour of the bot, free of Discord.
 * Callers pass in commands and a roster snapshot, and get back a reply and the messages to send.
 */

import {
  activeChores,
  addChore,
  maxChoreNameLength,
  scopeLabels,
  scopes,
  type Scope,
} from "./chores.ts";
import { openDatabase } from "./database.ts";
import { resolveMember } from "./housemates.ts";
import { escapeMarkdown } from "./markdown.ts";

export { maxChoreNameLength, scopes, scopeLabels, type Scope };

export interface Clock {
  now(): Date;
}

/** A server member as the caller sees them at the moment of the call. */
export interface Member {
  id: string;
  displayName: string;
  isBot: boolean;
  roleNames: readonly string[];
}

export type Roster = readonly Member[];

export interface Actor {
  memberId: string;
  /** Whether the member has the Discord Administrator permission. */
  isAdmin: boolean;
}

export type Command =
  | { name: "ping" }
  | { name: "chore add"; choreName: string; scope: Scope }
  | { name: "chore list" };

export interface Reply {
  content: string;
  /** Whether only the caller can see the reply. */
  private: boolean;
}

/** A message the caller must deliver beyond the reply. None exist yet. */
export type Outbound = never;

export interface CommandResult {
  reply: Reply;
  outbound: Outbound[];
}

export interface House {
  handle(call: {
    actor: Actor;
    roster: Roster;
    command: Command;
  }): CommandResult;
  /** Closes the database. The House must not be used afterwards. */
  close(): void;
}

export function openHouse(options: {
  databasePath: string;
  clock: Clock;
}): House {
  const db = openDatabase(options.databasePath);

  function reply(content: string): CommandResult {
    return { reply: { content, private: true }, outbound: [] };
  }

  return {
    close() {
      db.close();
    },

    handle({ actor, roster, command }) {
      if (command.name === "ping")
        return reply("Pong! Fade House bot is connected.");

      const resolution = resolveMember(roster, actor.memberId);
      switch (resolution.kind) {
        case "no floor":
          return reply(
            "Only Housemates can use this command. Ask an Admin to give you the Floor 1 or Floor 3 role.",
          );
        case "several floors":
          return reply(
            `You have both the ${resolution.floors.map((f) => `Floor ${String(f)}`).join(" and ")} roles, ` +
              "so you are not counted as a Housemate. Ask an Admin to remove one.",
          );
        case "housemate":
          break;
      }

      switch (command.name) {
        case "chore add": {
          const name = command.choreName.trim();
          if (name === "") return reply("A Chore needs a name.");
          if (name.length > maxChoreNameLength) {
            return reply(
              `A Chore name can be at most ${String(maxChoreNameLength)} characters.`,
            );
          }
          addChore(db, { name, scope: command.scope }, options.clock.now());
          return reply(
            `Added ${escapeMarkdown(name)} to the ${scopeLabels[command.scope]} Chores.`,
          );
        }

        case "chore list": {
          const chores = activeChores(db);
          return reply(
            scopes
              .map((scope) => {
                const names = chores
                  .filter((c) => c.scope === scope)
                  .map((c) => `- ${escapeMarkdown(c.name)}`);
                return [
                  `**${scopeLabels[scope]}**`,
                  ...(names.length > 0 ? names : ["None"]),
                ].join("\n");
              })
              .join("\n\n"),
          );
        }
      }
    },
  };
}
