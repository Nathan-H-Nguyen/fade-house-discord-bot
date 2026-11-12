/**
 * The House core: every behaviour of the bot, free of Discord.
 * Callers pass in commands and a roster snapshot, and get back a reply and the messages to send.
 */

import {
  activeChores,
  addChore,
  findActiveChore,
  foldChoreName,
  maxChoreNameLength,
  retireChore,
  scopeLabels,
  scopes,
  updateChore,
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
  | { name: "chore list" }
  /** `choreName` names an active Chore, picked by autocomplete or typed in any case. */
  | { name: "chore edit"; choreName: string; newName?: string; scope?: Scope }
  | { name: "chore retire"; choreName: string };

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

/** An option the caller is filling in, with the text typed so far. */
export type SuggestionField = { name: "chore"; text: string };

/** One autocomplete choice: what the Housemate sees, and what the command receives. */
export interface Suggestion {
  label: string;
  value: string;
}

/**
 * The House offers at most this many suggestions, each label at most this long,
 * which also keeps them within what Discord accepts.
 */
const maxSuggestions = 25;
const maxSuggestionLabelLength = 100;

export interface House {
  handle(call: {
    actor: Actor;
    roster: Roster;
    command: Command;
  }): CommandResult;
  /** Suggests values for an option as the member types it. Non-Housemates get none. */
  suggest(call: {
    actor: Actor;
    roster: Roster;
    field: SuggestionField;
  }): Suggestion[];
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

  /**
   * The refusal for a trimmed Chore name that cannot be used, if any.
   * `choreId` is the Chore being renamed, which may keep its own name in any case.
   */
  function invalidName(
    name: string,
    choreId?: number,
  ): CommandResult | undefined {
    if (name === "") return reply("A Chore needs a name.");
    if (name.length > maxChoreNameLength) {
      return reply(
        `A Chore name can be at most ${String(maxChoreNameLength)} characters.`,
      );
    }
    const existing = findActiveChore(db, name);
    if (existing && existing.id !== choreId) {
      return reply(
        `There is already a Chore named ${escapeMarkdown(existing.name)}.`,
      );
    }
    return undefined;
  }

  function noSuchChore(name: string): CommandResult {
    return reply(`There is no active Chore named ${escapeMarkdown(name)}.`);
  }

  return {
    close() {
      db.close();
    },

    suggest({ actor, roster, field }) {
      if (resolveMember(roster, actor.memberId).kind !== "housemate") return [];
      const text = foldChoreName(field.text.trim());
      return activeChores(db)
        .filter((c) => foldChoreName(c.name).includes(text))
        .slice(0, maxSuggestions)
        .map((c) => {
          const label = `${c.name} (${scopeLabels[c.scope]})`;
          return {
            label: label.length <= maxSuggestionLabelLength ? label : c.name,
            value: c.name,
          };
        });
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
          const invalid = invalidName(name);
          if (invalid) return invalid;
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

        case "chore edit": {
          const choreName = command.choreName.trim();
          const chore = findActiveChore(db, choreName);
          if (!chore) return noSuchChore(choreName);
          if (command.newName === undefined && command.scope === undefined) {
            return reply(
              `Give ${escapeMarkdown(chore.name)} a new name, a new Scope or both.`,
            );
          }
          const name = command.newName?.trim() ?? chore.name;
          const invalid = invalidName(name, chore.id);
          if (invalid) return invalid;
          const scope = command.scope ?? chore.scope;
          if (name === chore.name && scope === chore.scope) {
            return reply(
              `${escapeMarkdown(chore.name)} already has that name and Scope.`,
            );
          }
          updateChore(db, { ...chore, name, scope });

          const moved = `to the ${scopeLabels[scope]} Chores`;
          if (name === chore.name) {
            return reply(`Moved ${escapeMarkdown(name)} ${moved}.`);
          }
          const renamed = `Renamed ${escapeMarkdown(chore.name)} to ${escapeMarkdown(name)}`;
          return reply(
            scope === chore.scope
              ? `${renamed}.`
              : `${renamed} and moved it ${moved}.`,
          );
        }

        case "chore retire": {
          const choreName = command.choreName.trim();
          const chore = findActiveChore(db, choreName);
          if (!chore) return noSuchChore(choreName);
          retireChore(db, chore.id);
          return reply(
            `Retired ${escapeMarkdown(chore.name)}. It will not be handed out from next month.`,
          );
        }
      }
    },
  };
}
